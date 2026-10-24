#!/usr/bin/env python3
"""Gate secret-free sample PR checks and collect their unverified local evidence."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

from evidence_capture import capture
from evidence_tool import InvalidEvidence, SHA, read_json, report, require

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
        output = Path(os.environ["MANIFEST_PATH"])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(manifest, indent=2) + "\n")
        markdown = report(manifest, bytes_checked=True)
        output.with_suffix(".md").write_text(markdown)
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(markdown)
        # Collection success is separate from browser failure, preserved by the caller.
        return 0
    except (InvalidEvidence, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"PR evidence failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
