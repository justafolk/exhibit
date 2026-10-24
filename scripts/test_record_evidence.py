import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from record_evidence import record, repository_name


class AutomaticRecordingTest(unittest.TestCase):
    def git_reply(self, args, **kwargs):
        if args[1:3] == ['rev-parse', 'HEAD']:
            return 'a' * 40
        if args[1:3] == ['status', '--porcelain']:
            return ''
        return 'https://github.com/justafolk/exhibit.git'

    def test_dirty_checkout_never_starts_browser(self):
        with patch('record_evidence.subprocess.check_output', side_effect=['a' * 40, ' M changed.ts']), patch('record_evidence.subprocess.run') as run:
            with self.assertRaisesRegex(ValueError, 'Commit your changes'):
                record(Path('/unused'))
            run.assert_not_called()

    def test_failed_browser_still_collects_but_returns_failure(self):
        with TemporaryDirectory() as directory, patch('record_evidence.subprocess.check_output', side_effect=self.git_reply), patch('record_evidence.subprocess.run', side_effect=[subprocess.CompletedProcess([], 1), subprocess.CompletedProcess([], 0)]) as run:
            result, code = record(Path(directory), '--config=untrusted')
            self.assertEqual(code, 1)
            self.assertEqual(result['browserExitCode'], 1)
            self.assertEqual(result['verification'], 'unverified')
            self.assertFalse(result['uploaded'])
            self.assertIn('manifest', result)
            self.assertEqual(run.call_args_list[0].args[0][-1], '--grep=--config=untrusted')
            self.assertIn('evidence_capture.py', run.call_args_list[1].args[0][1])

    def test_collection_failure_cannot_claim_manifest(self):
        with TemporaryDirectory() as directory, patch('record_evidence.subprocess.check_output', side_effect=self.git_reply), patch('record_evidence.subprocess.run', side_effect=[subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 1)]):
            result, code = record(Path(directory))
            self.assertEqual(code, 1)
            self.assertNotIn('manifest', result)
            self.assertIn('error', result)

    def test_repository_provenance_rejects_credential_urls(self):
        self.assertEqual(repository_name('git@github.com:justafolk/exhibit.git'), 'justafolk/exhibit')
        self.assertEqual(repository_name('https://github.com/justafolk/exhibit.git'), 'justafolk/exhibit')
        with self.assertRaises(ValueError):
            repository_name('https://token@github.com/justafolk/exhibit.git')
