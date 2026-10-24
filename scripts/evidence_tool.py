#!/usr/bin/env python3
"""Validate evidence metadata and local artifact bytes; never authorize execution.

This CLI deliberately cannot issue a verified verdict. Provenance, redaction and
collector independence cannot be established from a self-reported JSON document.
"""
import argparse
from datetime import datetime
import hashlib
import html
import json
from pathlib import Path, PurePosixPath
import re
import sys

MAX_JSON_BYTES = 256 * 1024
MAX_ARTIFACT_BYTES = 512 * 1024 * 1024
SHA = re.compile(r"[a-f0-9]{40}\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


class InvalidEvidence(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidEvidence(message)


def fields(value, names, location):
    require(type(value) is dict, f"{location} must be an object")
    require(set(value) == set(names), f"{location} has missing or unsupported fields")


def text(value, location, maximum=512):
    require(isinstance(value, str) and 0 < len(value) <= maximum,
            f"{location} must be nonempty text of at most {maximum} characters")
    require(value.strip() == value and not any(ord(c) < 32 or ord(c) == 127 for c in value),
            f"{location} must not contain surrounding whitespace or control characters")


def integer(value, location, minimum=1, maximum=2**53-1):
    require(type(value) is int and minimum <= value <= maximum,
            f"{location} is outside its integer bounds")


def choice(value, options, location):
    require(isinstance(value, str) and value in options, f"{location} is unsupported")


def matching(value, pattern, location):
    require(isinstance(value, str) and pattern.fullmatch(value) is not None,
            f"{location} has an invalid format")


def common(value, allow_no_pr=False):
    integer(value["schemaVersion"], "schemaVersion", 1, 1)
    require(type(value["sample"]) is bool, "sample must be a boolean")
    matching(value["repository"], REPOSITORY, "repository")
    if not (allow_no_pr and value["pullRequest"] is None):
        integer(value["pullRequest"], "pullRequest")
    matching(value["headSha"], SHA, "headSha")
    matching(value["flowId"], IDENTIFIER, "flowId")
    matching(value["flowRevision"], SHA, "flowRevision")


def validate_request(value):
    fields(value, ("schemaVersion", "sample", "repository", "pullRequest", "headSha",
                   "flowId", "flowRevision", "runbookRef", "testTenant", "environment", "budgets"), "request")
    common(value)
    text(value["testTenant"], "testTenant", 128)
    choice(value["environment"], ("staging",), "environment")
    text(value["runbookRef"], "runbookRef")
    path, separator, revision = value["runbookRef"].rpartition("@")
    require(separator == "@" and SHA.fullmatch(revision), "runbookRef must end with @ and a full immutable commit SHA")
    safe_path(path, "runbookRef path")
    fields(value["budgets"], ("maxRuntimeSeconds", "maxArtifactBytes"), "budgets")
    integer(value["budgets"]["maxRuntimeSeconds"], "maxRuntimeSeconds", 1, 3600)
    integer(value["budgets"]["maxArtifactBytes"], "maxArtifactBytes", 1, MAX_ARTIFACT_BYTES)
    return value


def safe_path(value, location):
    text(value, location, 1024)
    path = PurePosixPath(value)
    require(not path.is_absolute() and str(path) == value and not any(part in (".", "..") for part in path.parts)
            and "\\" not in value and ":" not in value and value != ".", f"{location} must be a normalized relative path")
    return path


def timestamp(value, location):
    text(value, location, 40)
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value) is not None, f"{location} must be a UTC ISO timestamp with a Z suffix")
    try:
        result = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as error:
        raise InvalidEvidence(f"{location} must be an ISO timestamp") from error
    return result


def string_list(value, location):
    require(type(value) is list and len(value) <= 100, f"{location} must be a list of at most 100 items")
    for item in value:
        text(item, location)


def validate_manifest(value, expected_sha=None):
    fields(value, ("schemaVersion", "sample", "runId", "attempt", "repository", "pullRequest",
                   "headSha", "flowId", "flowRevision", "startedAt", "finishedAt", "origin",
                   "termination", "assertions", "artifacts", "notCovered", "cleanup"), "manifest")
    common(value, allow_no_pr=value["origin"] == "self_test")
    matching(value["runId"], IDENTIFIER, "runId")
    integer(value["attempt"], "attempt", 1, 100)
    choice(value["origin"], ("manual", "self_test", "runner"), "origin")
    choice(value["termination"], ("completed", "failed", "timed_out", "cancelled", "couldnt_run"), "termination")
    require(timestamp(value["finishedAt"], "finishedAt") >= timestamp(value["startedAt"], "startedAt"), "finishedAt precedes startedAt")
    if expected_sha is not None:
        matching(expected_sha, SHA, "expected SHA")
        require(value["headSha"] == expected_sha, "manifest head SHA is stale or does not match the expected commit")
    require(type(value["assertions"]) is list and len(value["assertions"]) <= 500, "assertions must be a bounded list")
    ids = set()
    for assertion in value["assertions"]:
        fields(assertion, ("id", "label", "status"), "assertion")
        matching(assertion["id"], IDENTIFIER, "assertion id")
        require(assertion["id"] not in ids, "duplicate assertion id")
        ids.add(assertion["id"])
        text(assertion["label"], "assertion label")
        choice(assertion["status"], ("passed", "failed", "skipped"), "assertion status")
    require(type(value["artifacts"]) is list and len(value["artifacts"]) <= 100, "artifacts must be a bounded list")
    paths = set()
    total = 0
    for artifact in value["artifacts"]:
        fields(artifact, ("path", "sha256", "bytes", "mediaType"), "artifact")
        safe_path(artifact["path"], "artifact path")
        require(artifact["path"] not in paths, "duplicate artifact path")
        paths.add(artifact["path"])
        matching(artifact["sha256"], DIGEST, "artifact sha256")
        integer(artifact["bytes"], "artifact bytes", 1, MAX_ARTIFACT_BYTES)
        total += artifact["bytes"]
        choice(artifact["mediaType"], ("video/webm", "video/mp4", "image/png", "application/zip", "application/json", "text/plain"), "artifact mediaType")
    require(total <= MAX_ARTIFACT_BYTES, "combined artifacts exceed size limit")
    string_list(value["notCovered"], "notCovered")
    fields(value["cleanup"], ("status", "details"), "cleanup")
    choice(value["cleanup"]["status"], ("completed", "failed", "not_needed", "unknown"), "cleanup status")
    text(value["cleanup"]["details"], "cleanup details")
    return value


def verify_artifacts(manifest, root):
    """Check local bytes, rejecting traversal and symlinks; no fetches or uploads."""
    root = Path(root).resolve(strict=True)
    for artifact in manifest["artifacts"]:
        relative = safe_path(artifact["path"], "artifact path")
        candidate = root
        for part in relative.parts:
            candidate = candidate / part
            require(not candidate.is_symlink(), "artifact symlinks are not allowed")
        require(candidate.is_file() and candidate.resolve().is_relative_to(root), "artifact is missing or outside artifact root")
        require(candidate.stat().st_size == artifact["bytes"], "artifact byte length does not match manifest")
        digest = hashlib.sha256()
        with candidate.open("rb") as source:
            total = 0
            while block := source.read(1024 * 1024):
                total += len(block)
                require(total <= artifact["bytes"], "artifact changed during verification")
                digest.update(block)
        require(total == artifact["bytes"] and digest.hexdigest() == artifact["sha256"], "artifact checksum does not match manifest")


def outcome(manifest):
    """A self-reported manifest can establish failures, never trusted success."""
    if manifest["termination"] == "couldnt_run":
        return "Could not run"
    if manifest["termination"] in ("failed", "timed_out") or any(a["status"] == "failed" for a in manifest["assertions"]):
        return "Failed"
    if manifest["termination"] == "cancelled":
        return "Cancelled"
    if manifest["cleanup"]["status"] == "failed":
        return "Cleanup failed"
    if any(a["status"] == "skipped" for a in manifest["assertions"]):
        return "Partial — skipped assertions"
    return "Unverified"


def markdown(value):
    value = html.escape(str(value), quote=True).replace("@", "&#64;")
    return re.sub(r"([\\`*_{}\[\]()#+.!|>-])", r"\\\1", value)


def report(manifest, bytes_checked=False):
    result = outcome(manifest)
    pr = f"PR #{manifest['pullRequest']}" if manifest["pullRequest"] is not None else "No associated pull request"
    lines = ["## Exhibit evidence report", "", f"**Outcome: {result}**", "",
             "Sample fixture — no customer execution." if manifest["sample"] else "Unverified provenance — this report cannot certify execution or redaction.", "",
             f"- Repository: {markdown(manifest['repository'])} · {pr}",
             f"- Head SHA: `{manifest['headSha']}`", f"- Run: `{manifest['runId']}` · attempt {manifest['attempt']}",
             f"- Flow: `{manifest['flowId']}` at `{manifest['flowRevision']}`",
             f"- Recorded interval: {markdown(manifest['startedAt'])} → {markdown(manifest['finishedAt'])}",
             f"- Origin claim: `{manifest['origin']}` (not independently authenticated)",
             f"- Termination: `{manifest['termination']}`", "", "### Assertions", ""]
    lines += [f"- {a['status'].upper()}: {markdown(a['label'])}" for a in manifest["assertions"]] or ["No assertions were recorded."]
    lines += ["", "### Coverage gaps", ""]
    lines += [f"- {markdown(gap)}" for gap in manifest["notCovered"]] or ["No gaps declared; completeness has not been independently established."]
    lines += ["", "### Artifacts", ""]
    lines += [f"- {markdown(a['path'])} · {a['bytes']} bytes · SHA-256 `{a['sha256']}`" for a in manifest["artifacts"]] or ["No artifacts available."]
    lines += ["", "Local artifact bytes were checked against this manifest." if bytes_checked else "Artifact bytes were not checked; listed hashes are declarations only.",
              "Redaction, collector identity and trusted execution remain unverified.", "", "### Cleanup", "",
              f"{markdown(manifest['cleanup']['status'])}: {markdown(manifest['cleanup']['details'])}", ""]
    return "\n".join(lines)


def reject_duplicates(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def read_json(path):
    with Path(path).open("rb") as source:
        raw = source.read(MAX_JSON_BYTES + 1)
    require(len(raw) <= MAX_JSON_BYTES, "JSON exceeds 256 KiB")
    try:
        return json.loads(raw, object_pairs_hook=reject_duplicates,
                          parse_constant=lambda value: (_ for _ in ()).throw(InvalidEvidence("non-finite JSON value")))
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError) as error:
        raise InvalidEvidence("invalid JSON") from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("request", "manifest", "report"))
    parser.add_argument("path", type=Path)
    parser.add_argument("--expected-sha")
    parser.add_argument("--artifact-root", type=Path)
    args = parser.parse_args()
    try:
        value = read_json(args.path)
        if args.command == "request":
            require(args.expected_sha is None and args.artifact_root is None, "request validation does not accept artifact flags")
            validate_request(value)
            print("Request structure is valid. Execution is not authorized.")
        else:
            validate_manifest(value, args.expected_sha)
            if args.artifact_root is not None:
                verify_artifacts(value, args.artifact_root)
            if args.command == "report":
                print(report(value, args.artifact_root is not None), end="")
            else:
                print(f"Manifest structure is valid. Outcome: {outcome(value)}. Provenance is not verified.")
    except (InvalidEvidence, OSError) as error:
        print(f"Evidence validation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
