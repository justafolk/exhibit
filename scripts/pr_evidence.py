#!/usr/bin/env python3
"""Gate secret-free sample PR checks and collect their unverified local evidence."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

from evidence_capture import capture
from api_evidence import collect_api
from evidence_previews import previews
from evidence_tool import InvalidEvidence, SHA, read_json, report, require, validate_manifest, verify_artifacts, timestamp

ACTIONS = {"opened", "reopened", "synchronize", "labeled", "ready_for_review"}


def eligible(event, event_name):
    """GitHub's event selects a sample CI run, never authorizes staging access."""
    if event_name != "pull_request" or event.get("action") not in ACTIONS:
        return False
    pr = event.get("pull_request", {})
    repository = event.get("repository", {}).get("full_name")
    head = pr.get("head", {})
    base = pr.get("base", {})
    return bool(
        repository == "justafolk/sample-project-exhibit"
        and pr.get("state") == "open" and pr.get("draft") is False
        and head.get("repo", {}).get("full_name") == repository
        and head.get("repo", {}).get("fork") is False
        and base.get("repo", {}).get("full_name") == repository
        and type(pr.get("number")) is int and pr["number"] > 0
        and isinstance(head.get("sha"), str) and SHA.fullmatch(head["sha"])
        and any(label.get("name") == "agent-test" for label in pr.get("labels", []))
        and (event["action"] != "labeled" or event.get("label", {}).get("name") == "agent-test")
    )


def collect(event, playwright, root, run_id, attempt):
    require(eligible(event, "pull_request"), "event is not an eligible agent-test sample PR")
    pr = event["pull_request"]
    sha = pr["head"]["sha"]
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    require(actual == sha, "checkout does not match the PR head SHA")
    require(not subprocess.check_output(["git", "status", "--porcelain"], text=True).strip(),
            "checkout changes prevent commit-linked capture")
    return capture(playwright, root, event["repository"]["full_name"], sha, run_id, attempt,
                   pull_request=pr["number"], flow_id="checkout.saved-address")



def recording_index(manifest):
    """Index original video bytes without claiming playback or independent trust."""
    return {"schemaVersion": 1, "sample": True, "verification": "unverified",
            "repository": manifest["repository"], "pullRequest": manifest["pullRequest"],
            "headSha": manifest["headSha"], "runId": manifest["runId"],
            "attempt": manifest["attempt"],
            "recordings": [artifact.copy() for artifact in manifest["artifacts"]
                           if artifact["mediaType"] in ("video/webm", "video/mp4")]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("gate", "collect"))
    args = parser.parse_args()
    try:
        event = read_json(os.environ["GITHUB_EVENT_PATH"])
        allowed = eligible(event, os.environ["GITHUB_EVENT_NAME"])
        if args.mode == "gate":
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"eligible={'true' if allowed else 'false'}\n")
                if allowed:
                    output.write(f"sha={event['pull_request']['head']['sha']}\n")
            print("Eligible labelled sample PR" if allowed else "Skipped: not an eligible agent-test sample PR")
            return 0
        require(allowed, "event is not an eligible agent-test sample PR")
        manifest = collect(event, read_json(Path(os.environ["PLAYWRIGHT_JSON"])),
                           Path(os.environ["ARTIFACT_ROOT"]),
                           f"sample-pr-{os.environ['GITHUB_RUN_ID']}", int(os.environ["GITHUB_RUN_ATTEMPT"]))
        if os.environ.get("REQUIRE_API", "false") == "true":
            api_assertions, api_artifacts, api_provenance = collect_api(
                os.environ["API_JUNIT"], os.environ["API_CAPTURE"], manifest["headSha"], Path(os.environ["ARTIFACT_ROOT"]))
            manifest["assertions"].extend(api_assertions)
            manifest["artifacts"].extend(api_artifacts)
            manifest["startedAt"] = min((manifest["startedAt"], api_provenance["startedAt"]), key=lambda value: timestamp(value, "start time"))
            manifest["finishedAt"] = max((manifest["finishedAt"], api_provenance["finishedAt"]), key=lambda value: timestamp(value, "finish time"))
            if any(a["status"] == "failed" for a in api_assertions):
                manifest["termination"] = "failed"
            manifest["notCovered"][0] = "Secret-free sample frontend browser and backend API tests only; no deployed staging or production was exercised"
            validate_manifest(manifest, manifest["headSha"])
            verify_artifacts(manifest, Path(os.environ["ARTIFACT_ROOT"]))
        preview_index = None
        if os.environ.get("CREATE_PREVIEWS", "false") == "true":
            preview_index, preview_artifacts = previews(manifest, Path(os.environ["ARTIFACT_ROOT"]))
            manifest["artifacts"].extend(preview_artifacts)
            validate_manifest(manifest, manifest["headSha"])
            verify_artifacts(manifest, Path(os.environ["ARTIFACT_ROOT"]))
        output = Path(os.environ["MANIFEST_PATH"])
        output.parent.mkdir(parents=True, exist_ok=True)
        if preview_index is not None:
            output.with_name("previews.json").write_text(json.dumps(preview_index, indent=2)+"\n")
        output.write_text(json.dumps(manifest, indent=2) + "\n")
        markdown = report(manifest, bytes_checked=True)
        output.with_suffix(".md").write_text(markdown)
        index = recording_index(manifest)
        output.with_name("recordings.json").write_text(json.dumps(index, indent=2) + "\n")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(markdown)
            summary.write(f"\n### Video recordings\n\n{len(index['recordings'])} original recording(s) indexed in `recordings.json`. "
                          "Paths are relative to the uploaded `test-results/` directory.\n")
        require(os.environ.get("REQUIRE_VIDEO", "false") == "false" or index["recordings"],
                "video recording was required but no video artifact was produced")
        # Collection success is separate from browser failure, preserved by the caller.
        return 0
    except (InvalidEvidence, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"PR evidence failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
