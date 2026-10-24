import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from codex_ci_report import build, finalize, html_report, markdown, write

ENV = {'EXPECTED_PR':'1', 'EXPECTED_SHA':'a' * 40, 'EXPECTED_RUN_ID':'123', 'EXPECTED_ATTEMPT':'2'}
EVIDENCE = {'termination':'completed', 'assertions':[
    {'status':'passed'}, {'status':'failed'}, {'status':'skipped'}],
    'artifacts':[{'mediaType':'video/webm'},{'mediaType':'image/png'}], 'notCovered':['Production payments']}


class CodexCIReportTests(unittest.TestCase):
    def test_completed_report_preserves_failures_and_actual_counts(self):
        with patch.dict(os.environ, ENV):
            data = build('completed', evidence=EVIDENCE, review='Investigate the failed checkout assertion.', started_at='2026-01-01T00:00:00Z')
        self.assertEqual(data['status'], 'completed')
        self.assertEqual(data['verification'], 'unverified')
        self.assertEqual(data['evidence']['browserAssertions'], {'passed':1,'failed':1,'skipped':1})
        self.assertEqual(data['evidence']['recordings'], 1)
        self.assertTrue(data['evidenceValidated'])
        self.assertEqual(data['headSha'], 'a' * 40)
        self.assertIn('Failed: 1', markdown(data))
        self.assertIn('not video contents', html_report(data))

    def test_no_auth_and_failed_reports_never_imply_agent_or_test_success(self):
        missing = build('not_configured')
        self.assertIsNone(missing['evidence'])
        self.assertIsNone(missing['review'])
        self.assertFalse(missing['evidenceValidated'])
        self.assertIn('No agent was run', markdown(missing))
        failed = build('failed', evidence=EVIDENCE, failure={'stage':'CLI execution','category':'timeout'})
        self.assertIn('timeout', html_report(failed))
        self.assertIsNone(failed['review'])
        self.assertEqual(failed['evidence']['browserAssertions']['failed'], 1)

    def test_model_text_cannot_inject_html_or_escape_markdown_fence(self):
        advice = '<script>alert(1)</script>\n`````\n<img src=x onerror=alert(1)>'
        evidence = {**EVIDENCE, 'notCovered':['<iframe src=https://example.invalid>']}
        data = build('completed', evidence=evidence, review=advice)
        page = html_report(data)
        self.assertNotIn('<script>', page)
        self.assertNotIn('<iframe', page)
        self.assertNotIn('<img', page)
        self.assertIn('&lt;script&gt;', page)
        self.assertIn('``````text', markdown(data))

    def test_all_formats_and_action_outputs_survive_setup_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); review = root / 'codex-review/review.md'
            env = {**ENV, 'REVIEW_OUTPUT':str(review), 'GITHUB_OUTPUT':str(root/'outputs'), 'GITHUB_STEP_SUMMARY':str(root/'summary'), 'CODEX_AUTH_JSON':'synthetic-secret-not-to-publish'}
            with patch.dict(os.environ, env):
                finalize()
            data = json.loads((review.parent/'report.json').read_text())
            self.assertEqual(data['status'],'failed')
            self.assertIsNone(data['startedAt'])
            self.assertFalse(data['evidenceValidated'])
            for name in ('report.json','report.md','report.html'):
                self.assertTrue((review.parent/name).is_file())
                self.assertNotIn('synthetic-secret-not-to-publish',(review.parent/name).read_text())
            self.assertIn('report-html=',(root/'outputs').read_text())
            self.assertIn('status=failed',(root/'outputs').read_text())
            self.assertIn('Codex CI report',(root/'summary').read_text())

    def test_finalizer_keeps_completed_review_and_source_identity(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, ENV):
            root = Path(directory); review = root/'review.md'
            data = build('completed', evidence=EVIDENCE, review='Add a cleanup regression test.')
            write(data, review)
            with patch.dict(os.environ, {'REVIEW_OUTPUT':str(review),'GITHUB_OUTPUT':str(root/'outputs'),'GITHUB_STEP_SUMMARY':str(root/'summary')}):
                finalize()
            self.assertEqual(json.loads((root/'report.json').read_text())['workflowRunId'],123)
            self.assertIn('Add a cleanup regression test.',(root/'report.html').read_text())
            self.assertIn('status=completed',(root/'outputs').read_text())


if __name__ == '__main__':
    unittest.main()
