import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from evidence_tool import InvalidEvidence, outcome, verify_artifacts
from pr_evidence import collect, eligible


def event():
    repo = {"full_name": "justafolk/sample-project-exhibit", "fork": False}
    return {"action": "opened", "repository": repo, "pull_request": {
        "number": 12, "state": "open", "draft": False, "labels": [{"name": "agent-test"}],
        "head": {"repo": repo.copy(), "sha": "a" * 40}, "base": {"repo": repo.copy()}}}


def browser_report(status="expected", expected_status="passed"):
    return {"config": {"metadata": {"exhibitCapture": {"schemaVersion": 1, "headSha": "a" * 40, "dirty": False}}},
            "stats": {"startTime": "2026-01-01T10:00:00Z", "duration": 1000}, "errors": [],
            "suites": [{"specs": [{"title": "saved-address checkout", "tests": [
                {"projectName": "chromium", "status": status, "expectedStatus": expected_status}]}]}]}


class PREvidenceTests(unittest.TestCase):
    def test_supported_labelled_lifecycle(self):
        for action in ("opened", "reopened", "synchronize", "ready_for_review", "labeled"):
            value = event()
            value.update(action=action, label={"name": "agent-test"})
            self.assertTrue(eligible(value, "pull_request"), action)

    def test_unlabelled_removed_draft_closed_forks_and_other_repositories_skip(self):
        variants = []
        for key, value in (("labels", []), ("draft", True), ("draft", None), ("state", "closed"), ("number", True)):
            candidate = event()
            candidate["pull_request"][key] = value
            variants.append(candidate)
        candidate = event(); candidate["pull_request"]["head"]["repo"]["fork"] = True; variants.append(candidate)
        candidate = event(); candidate["pull_request"]["head"]["repo"]["full_name"] = "outsider/fork"; variants.append(candidate)
        candidate = event(); candidate["repository"] = {"full_name": "other/project"}; variants.append(candidate)
        candidate = event(); candidate["pull_request"]["head"]["sha"] = "main"; variants.append(candidate)
        for action in ("closed", "unlabeled", "edited"):
            candidate = event(); candidate["action"] = action; variants.append(candidate)
        candidate = event(); candidate.update(action="labeled", label={"name": "other-label"}); variants.append(candidate)
        for candidate in variants:
            with self.subTest(candidate=candidate):
                self.assertFalse(eligible(candidate, "pull_request"))
        self.assertFalse(eligible(event(), "pull_request_target"))
        self.assertFalse(eligible(event(), "workflow_dispatch"))

    def test_collector_binds_actual_pr_sha_and_checks_real_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "video.webm").write_bytes(b"sample bytes")
            with patch("pr_evidence.subprocess.check_output", side_effect=["a" * 40 + "\n", ""]):
                manifest = collect(event(), browser_report(), root, "sample-pr-1", 1)
            self.assertEqual(manifest["pullRequest"], 12)
            self.assertEqual(manifest["headSha"], "a" * 40)
            self.assertEqual(manifest["flowId"], "checkout.saved-address")
            self.assertEqual(manifest["artifacts"][0]["sha256"], hashlib.sha256(b"sample bytes").hexdigest())
            self.assertEqual(outcome(manifest), "Unverified")
            self.assertTrue(manifest["sample"])
            (root / "video.webm").write_bytes(b"tamper bytes")
            with self.assertRaises(InvalidEvidence):
                verify_artifacts(manifest, root)

    def test_stale_checkout_dirty_tree_and_stale_report_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for outputs, data in ((["b" * 40], browser_report()), (["a" * 40, " M source.js"], browser_report()),
                                  (["a" * 40, ""], {**browser_report(), "config": {}})):
                with self.subTest(outputs=outputs), patch("pr_evidence.subprocess.check_output", side_effect=outputs):
                    with self.assertRaises(InvalidEvidence):
                        collect(event(), data, Path(directory), "sample-pr-1", 1)

    def test_failures_skips_expected_failures_and_empty_suite_never_pass(self):
        from evidence_capture import capture
        with tempfile.TemporaryDirectory() as directory:
            for status, expected_status, result in (("unexpected", "passed", "Failed"), ("flaky", "passed", "Failed"),
                                                     ("skipped", "passed", "Partial — skipped assertions"),
                                                     ("expected", "failed", "Partial — skipped assertions"),
                                                     ("unexpected", "failed", "Failed")):
                manifest = capture(browser_report(status, expected_status), Path(directory),
                                   "justafolk/sample-project-exhibit", "a" * 40, "sample-pr-1", 1, pull_request=12)
                self.assertEqual(outcome(manifest), result)
            data = browser_report(); data["suites"] = []
            manifest = capture(data, Path(directory), "justafolk/sample-project-exhibit", "a" * 40, "sample-pr-1", 1, pull_request=12)
            self.assertEqual(outcome(manifest), "Could not run")

    def test_gate_cli_outputs_only_eligible_sha(self):
        script = str(Path(__file__).with_name("pr_evidence.py"))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "event.json"; output = root / "output"
            for allowed in (True, False):
                value = event()
                if not allowed: value["pull_request"]["labels"] = []
                path.write_text(json.dumps(value)); output.write_text("")
                subprocess.run(["python3", script, "gate"], env={**os.environ, "GITHUB_EVENT_PATH": str(path),
                    "GITHUB_EVENT_NAME": "pull_request", "GITHUB_OUTPUT": str(output)}, check=True, capture_output=True)
                self.assertEqual(output.read_text(), "eligible=true\nsha=" + "a" * 40 + "\n" if allowed else "eligible=false\n")


if __name__ == "__main__":
    unittest.main()
