#!/usr/bin/env python3
"""Collect secret-free sample Playwright output into an unverified self-test manifest.

Only use on the isolated, secret-free sample test workflow. This does not redact
files or establish trusted provenance. Nothing is uploaded by this script.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from evidence_tool import InvalidEvidence, MAX_ARTIFACT_BYTES, report, require, validate_manifest, verify_artifacts

MEDIA = {".webm": "video/webm", ".mp4": "video/mp4", ".png": "image/png", ".zip": "application/zip"}


def collect_tests(suites):
    assertions = []
    for suite in suites:
        assertions.extend(collect_tests(suite.get("suites", [])))
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                status = test.get("status")
                if status not in ("expected", "skipped"):
                    outcome = "failed"
                elif status == "skipped" or test.get("expectedStatus", "passed") != "passed":
                    outcome = "skipped"
                else:
                    outcome = "passed"
                label = f"Browser test: {spec.get('title', 'Unnamed browser test')} ({test.get('projectName', 'default')})"
                assertions.append({"id": "pending", "label": label, "status": outcome})
    return assertions


def capture(playwright, root, repository, sha, run_id, attempt, *, pull_request=None, flow_id="exhibit.browser-self-test"):
    require(type(playwright) is dict, "Playwright report must be an object")
    config = playwright.get("config")
    require(type(config) is dict and type(config.get("metadata")) is dict,
            "Playwright report is missing capture provenance")
    provenance = config["metadata"].get("exhibitCapture")
    require(type(provenance) is dict and type(provenance.get("schemaVersion")) is int
            and provenance["schemaVersion"] == 1, "Playwright report is missing supported capture provenance")
    require(provenance.get("headSha") == sha,
            "Playwright report was recorded at a different commit; refusing stale capture")
    require(provenance.get("dirty") is False,
            "Playwright capture started from a dirty or unknown checkout")
    root = root.resolve()
    require(root.is_dir(), "test-results artifact directory is missing")
    stats = playwright.get("stats", {})
    require(isinstance(stats.get("startTime"), str) and type(stats.get("duration")) in (int, float), "Playwright report has no complete timing metadata")
    try:
        started = datetime.fromisoformat(stats["startTime"].replace("Z", "+00:00"))
        require(started.tzinfo is not None and 0 <= stats["duration"] <= 3600 * 1000, "invalid Playwright timing metadata")
        finished = started + timedelta(milliseconds=stats["duration"])
    except (ValueError, OverflowError) as error:
        raise InvalidEvidence("invalid Playwright timing metadata") from error
    assertions = collect_tests(playwright.get("suites", []))
    for index, assertion in enumerate(assertions):
        assertion["id"] = f"browser-test-{index + 1}"
    errors = playwright.get("errors", [])
    if errors:
        assertions.append({"id": "playwright-runner", "label": "Playwright runner completed without infrastructure errors", "status": "failed"})
    artifacts = []
    total = 0
    for path in sorted(root.rglob("*")):
        if path.suffix not in MEDIA or not path.is_file():
            continue
        require(not path.is_symlink() and all(not parent.is_symlink() for parent in path.parents if parent != root.parent), "artifact symlinks are not allowed")
        size = path.stat().st_size
        require(0 < size <= MAX_ARTIFACT_BYTES, "artifact size exceeds limit or is empty")
        total += size
        require(total <= MAX_ARTIFACT_BYTES, "combined artifacts exceed limit")
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while block := source.read(1024 * 1024):
                digest.update(block)
        artifacts.append({"path": path.relative_to(root).as_posix(), "sha256": digest.hexdigest(), "bytes": size, "mediaType": MEDIA[path.suffix]})
    gaps = ["Secret-free sample PR browser tests only; no deployed staging or production was exercised" if pull_request is not None else "Exhibit sample-mode self-test only; no customer PR or staging environment was executed",
            "Collector identity, artifact redaction and execution provenance are not independently verified"]
    if not any(a["mediaType"].startswith("video/") for a in artifacts):
        gaps.append("No video artifact was produced")
    manifest = {"schemaVersion": 1, "sample": True, "runId": run_id, "attempt": attempt,
                "repository": repository, "pullRequest": pull_request, "headSha": sha,
                "flowId": flow_id, "flowRevision": sha,
                "startedAt": started.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "finishedAt": finished.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "origin": "self_test", "termination": "failed" if errors or any(a["status"] == "failed" for a in assertions) else "completed" if assertions else "couldnt_run",
                "assertions": assertions, "artifacts": artifacts, "notCovered": gaps,
                "cleanup": {"status": "not_needed", "details": "Sample-mode tests do not write customer staging data; process and runner cleanup are not independently verified"}}
    validate_manifest(manifest, sha)
    verify_artifacts(manifest, root)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--playwright-json", type=Path, required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--attempt", type=int, default=1)
    args = parser.parse_args()
    try:
        actual_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        require(actual_sha == args.sha, "requested SHA does not match the checked-out commit")
        # A dirty checkout cannot faithfully bind the test implementation to HEAD.
        require(not subprocess.check_output(["git", "status", "--porcelain"], text=True).strip(), "checkout changes prevent commit-linked capture")
        with args.playwright_json.open() as source:
            data = json.load(source)
        manifest = capture(data, args.artifact_root, args.repository, actual_sha, args.run_id, args.attempt)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(manifest, indent=2) + "\n")
        print(report(manifest, bytes_checked=True), end="")
    except (InvalidEvidence, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f"Self-test capture failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
