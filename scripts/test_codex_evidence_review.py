import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest
from unittest.mock import patch

from codex_evidence_review import cli_command, main, prepare, run_cli
from evidence_capture import capture
from evidence_tool import InvalidEvidence
from pr_evidence import recording_index
from test_pr_evidence import browser_report


class CodexReviewTests(unittest.TestCase):
    def bundle(self, root):
        artifacts = root / 'test-results'; artifacts.mkdir()
        (artifacts / 'video.webm').write_bytes(b'video bytes')
        manifest = capture(browser_report(), artifacts, 'justafolk/sample-project-exhibit', 'a' * 40,
                           'sample-pr-123', 2, pull_request=12)
        path = root / '.local/evidence/manifest.json'; path.parent.mkdir(parents=True)
        path.write_text(json.dumps(manifest))
        return manifest

    def test_recording_index_preserves_original_video_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = self.bundle(Path(directory))
            index = recording_index(manifest)
            self.assertEqual(index['verification'], 'unverified')
            self.assertEqual(index['pullRequest'], 12)
            self.assertEqual(index['recordings'][0]['sha256'], hashlib.sha256(b'video bytes').hexdigest())
            manifest['artifacts'] = []
            self.assertEqual(recording_index(manifest)['recordings'], [])

    def test_prepare_binds_run_attempt_pr_sha_and_artifact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            evidence = prepare(root, 'a' * 40, 12, '123', 2)
            self.assertNotIn('verdict', evidence)
            for sha, pr, run, attempt in [('b' * 40, 12, '123', 2), ('a' * 40, 13, '123', 2),
                                          ('a' * 40, 12, 'other', 2), ('a' * 40, 12, '123', 3)]:
                with self.assertRaises(InvalidEvidence):
                    prepare(root, sha, pr, run, attempt)
            (root / 'test-results/video.webm').write_bytes(b'tamper data')
            with self.assertRaises(InvalidEvidence):
                prepare(root, 'a' * 40, 12, '123', 2)

    def test_cli_is_unprivileged_ephemeral_read_only_and_denies_auth_and_proc(self):
        args = cli_command('/bin/codex', Path('/tmp/auth'), Path('/tmp/context'), Path('/tmp/review.md'))
        self.assertEqual(args[:4], ['sudo', '-u', 'exhibit-review', 'timeout'])
        self.assertIn('--kill-after=10s', args)
        self.assertIn('-i', args)
        self.assertIn('--ephemeral', args)
        self.assertIn('--ignore-user-config', args)
        self.assertIn('--ignore-rules', args)
        self.assertNotIn('--dangerously-bypass-approvals-and-sandbox', args)
        config = tomllib.loads('\n'.join(args[i+1] for i, arg in enumerate(args) if arg == '-c'))
        profile = config['permissions']['evidence']
        self.assertEqual(profile['extends'], ':read-only')
        self.assertIs(profile['network']['enabled'], False)
        self.assertEqual(profile['filesystem'], {'/tmp/auth':'deny', '/proc':'deny'})
        self.assertEqual(config['approval_policy'], 'never')

    def test_missing_auth_is_explicitly_not_run(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / 'summary'; output = Path(directory) / 'output'
            with patch.dict(os.environ, {'CODEX_AUTH_JSON':'', 'GITHUB_STEP_SUMMARY':str(summary), 'GITHUB_OUTPUT':str(output)}), patch('codex_evidence_review.run_cli') as cli:
                self.assertEqual(main(), 0)
                cli.assert_not_called()
            self.assertEqual(output.read_text(), 'status=not_configured\n')
            self.assertIn('No agent was run', summary.read_text())

    def test_invalid_auth_fails_without_echoing_secret(self):
        with self.assertRaises(InvalidEvidence):
            run_cli({'tokens':{}}, {}, Path('/bin/codex'))

    def test_failed_agent_never_creates_a_passing_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            summary = root / 'summary'; output = root / 'outputs'; review = root / 'review.md'
            environment = {'CODEX_AUTH_JSON':json.dumps({'tokens':{'access_token':'synthetic-test-token'}}),
                'EVIDENCE_BUNDLE':str(root), 'EXPECTED_SHA':'a' * 40, 'EXPECTED_PR':'12',
                'EXPECTED_RUN_ID':'123','EXPECTED_ATTEMPT':'2', 'CODEX_BINARY':'/bin/codex',
                'GITHUB_STEP_SUMMARY':str(summary), 'GITHUB_OUTPUT':str(output), 'REVIEW_OUTPUT':str(review)}
            with patch.dict(os.environ, environment), patch('codex_evidence_review.run_cli', side_effect=subprocess.TimeoutExpired('codex',300)):
                self.assertEqual(main(), 1)
            self.assertEqual(output.read_text(), 'status=failed\n')
            self.assertFalse(review.exists())


if __name__ == '__main__':
    unittest.main()
