import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from evidence_capture import capture
from evidence_tool import InvalidEvidence, outcome, read_json, report, validate_manifest, validate_request, verify_artifacts

ROOT = Path(__file__).resolve().parents[1]


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.request = json.loads((ROOT / "agents/examples/request.json").read_text())
        self.manifest = json.loads((ROOT / "agents/examples/manifest.json").read_text())

    def test_example_request_is_only_structurally_valid(self):
        self.assertEqual(validate_request(self.request), self.request)

    def test_request_rejects_unsafe_or_ambiguous_fields(self):
        mutations = [
            lambda r: r.update(environment="production"),
            lambda r: r.update(pullRequest=True),
            lambda r: r.update(repository="owner/repo;run-command"),
            lambda r: r.update(headSha="abc"),
            lambda r: r.update(runbookRef="agents/runbook.yaml@main"),
            lambda r: r.update(runbookRef="../secret@" + "a" * 40),
            lambda r: r.update(sample="true"),
            lambda r: r.update(authorized=True),
            lambda r: r["budgets"].update(maxRuntimeSeconds=3601),
            lambda r: r["budgets"].update(maxArtifactBytes=-1),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                request = copy.deepcopy(self.request)
                mutate(request)
                with self.assertRaises(InvalidEvidence):
                    validate_request(request)

    def test_duplicate_json_keys_and_nonfinite_values_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            for raw in ('{"sample":true,"sample":false}', '{"value":NaN}', '{"nested":{"a":1,"a":2}}', 'x' * (256 * 1024 + 1)):
                path.write_text(raw)
                with self.assertRaises(InvalidEvidence):
                    read_json(path)

    def test_manifest_rejects_forged_verdict_and_stale_sha(self):
        validate_manifest(self.manifest)
        with self.assertRaisesRegex(InvalidEvidence, "stale"):
            validate_manifest(self.manifest, "a" * 40)
        self.manifest["verdict"] = "verified"
        with self.assertRaises(InvalidEvidence):
            validate_manifest(self.manifest)

    def test_passing_manual_or_runner_claims_never_verify(self):
        self.manifest["termination"] = "completed"
        self.manifest["assertions"][0]["status"] = "passed"
        for origin in ("manual", "runner", "self_test"):
            self.manifest["origin"] = origin
            validate_manifest(self.manifest)
            self.assertEqual(outcome(self.manifest), "Unverified")
            self.assertIn("No artifacts available", report(self.manifest))

    def test_failure_and_cleanup_failure_remain_visible(self):
        self.manifest["termination"] = "completed"
        self.manifest["assertions"][0]["status"] = "failed"
        self.assertEqual(outcome(self.manifest), "Failed")
        self.manifest["assertions"][0]["status"] = "passed"
        self.manifest["cleanup"]["status"] = "failed"
        self.assertEqual(outcome(self.manifest), "Cleanup failed")
        self.assertIn("failed:", report(self.manifest))

    def test_empty_or_skipped_assertions_do_not_pass(self):
        self.manifest["termination"] = "completed"
        self.assertEqual(outcome(self.manifest), "Partial — skipped assertions")
        self.manifest["assertions"] = []
        self.assertEqual(outcome(self.manifest), "Unverified")

    def test_invalid_times_and_duplicate_assertions_rejected(self):
        for value in ("2026-01-01Z", "2026-01-01T10:00:00+00:00", "2025-01-01T10:00:00Z"):
            candidate = copy.deepcopy(self.manifest)
            candidate["finishedAt"] = value
            with self.assertRaises(InvalidEvidence):
                validate_manifest(candidate)
        self.manifest["assertions"].append(copy.deepcopy(self.manifest["assertions"][0]))
        with self.assertRaises(InvalidEvidence):
            validate_manifest(self.manifest)

    def artifact(self, path="recording.webm", content=b"sample recording bytes"):
        return {"path": path, "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content), "mediaType": "video/webm"}

    def test_hashes_and_size_are_checked_against_actual_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "recording.webm"
            path.write_bytes(b"sample recording bytes")
            self.manifest["artifacts"] = [self.artifact()]
            validate_manifest(self.manifest)
            verify_artifacts(self.manifest, root)
            path.write_bytes(b"tamper recording bytes")
            with self.assertRaisesRegex(InvalidEvidence, "checksum"):
                verify_artifacts(self.manifest, root)
            path.write_bytes(b"short")
            with self.assertRaisesRegex(InvalidEvidence, "length"):
                verify_artifacts(self.manifest, root)
            path.unlink()
            with self.assertRaisesRegex(InvalidEvidence, "missing"):
                verify_artifacts(self.manifest, root)

    def test_paths_duplicates_and_symlinks_rejected(self):
        for path in ("../video.webm", "/video.webm", "video\\file.webm", "./video.webm", "a//video.webm", "https://example.org/video.webm"):
            self.manifest["artifacts"] = [self.artifact(path)]
            with self.assertRaises(InvalidEvidence):
                validate_manifest(self.manifest)
        self.manifest["artifacts"] = [self.artifact(), self.artifact()]
        with self.assertRaises(InvalidEvidence):
            validate_manifest(self.manifest)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "outside.webm").write_bytes(b"sample recording bytes")
            (root / "recording.webm").symlink_to(root / "outside.webm")
            self.manifest["artifacts"] = [self.artifact()]
            with self.assertRaisesRegex(InvalidEvidence, "symlinks"):
                verify_artifacts(self.manifest, root)

    def test_report_escapes_untrusted_labels_and_keeps_full_provenance(self):
        self.manifest["assertions"][0]["label"] = '<img src=x> [approve](https://example.org) @team'
        output = report(self.manifest)
        self.assertNotIn("<img", output)
        self.assertNotIn("[approve]", output)
        self.assertNotIn("@team", output)
        self.assertIn(self.manifest["headSha"], output)
        self.assertIn("Sample fixture", output)
        self.assertIn("Artifact bytes were not checked", output)

    def test_self_test_capture_preserves_failure_and_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "test.webm").write_bytes(b"video bytes")
            data = {"stats": {"startTime": "2026-01-01T10:00:00Z", "duration": 4000}, "errors": [], "suites": [{"specs": [{"title": "A real browser test", "tests": [{"projectName": "chromium", "status": "unexpected"}]}]}]}
            manifest = capture(data, root, "acme/exhibit", "a" * 40, "self-test-1", 1)
            self.assertEqual(outcome(manifest), "Failed")
            self.assertIsNone(manifest["pullRequest"])
            self.assertEqual(manifest["artifacts"][0]["sha256"], hashlib.sha256(b"video bytes").hexdigest())
            self.assertEqual(manifest["finishedAt"], "2026-01-01T10:00:04.000Z")
            self.assertTrue(manifest["sample"])


if __name__ == "__main__":
    unittest.main()
