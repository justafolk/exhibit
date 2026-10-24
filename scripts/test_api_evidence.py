import json
from pathlib import Path
import tempfile
import unittest

from api_evidence import collect_api
from codex_ci_report import build, html_report, markdown
from evidence_tool import InvalidEvidence, verify_artifacts


class APIEvidenceTests(unittest.TestCase):
    def fixture(self, root, xml='<testsuites><testcase name="pricing"/><testcase name="cleanup"/></testsuites>', **changes):
        xml_path=root/'api.xml'; xml_path.write_text(xml)
        meta={'schemaVersion':1,'headSha':'a'*40,'dirty':False,'exitCode':0,'signal':None,
              'startedAt':'2026-01-01T00:00:00.000Z','finishedAt':'2026-01-01T00:00:01.000Z',**changes}
        path=root/'capture.json';path.write_text(json.dumps(meta))
        return xml_path,path,root/'artifacts'

    def test_passed_backend_cases_are_preserved_and_actual_bytes_are_hashed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            assertions,artifacts,provenance=collect_api(*self.fixture(root)[:2], 'a'*40,root/'artifacts')
            self.assertEqual([a['label'] for a in assertions],['API test: pricing','API test: cleanup'])
            self.assertEqual([a['status'] for a in assertions],['passed','passed'])
            verify_artifacts({'artifacts':artifacts},root/'artifacts')
            (root/'artifacts/api/api-tests.xml').write_text('tampered')
            with self.assertRaises(InvalidEvidence): verify_artifacts({'artifacts':artifacts},root/'artifacts')

    def test_failure_and_skip_are_separate_and_nonzero_runner_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for xml,expected in [('<testsuites><testcase name="bad"><failure/></testcase><testcase name="gap"><skipped/></testcase></testsuites>',['failed','skipped']),
                                 ('<testsuites><testcase name="ok"/></testsuites>',['passed','failed'])]:
                junit,meta,output=self.fixture(root,xml,exitCode=1)
                assertions,_,_=collect_api(junit,meta,'a'*40,output)
                self.assertEqual([a['status'] for a in assertions],expected)

    def test_missing_stale_dirty_empty_all_skipped_unsafe_and_conflicting_reports_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for changes in ({'headSha':'b'*40},{'dirty':True},{'dirty':0},{'exitCode':None,'signal':'SIGKILL'}, {'finishedAt':'2025-01-01T00:00:00Z'}):
                junit,meta,output=self.fixture(root,**changes)
                with self.assertRaises(InvalidEvidence): collect_api(junit,meta,'a'*40,output)
            for xml in ('<testsuites/>','<testsuites><testcase name="gap"><skipped/></testcase></testsuites>',
                        '<!DOCTYPE testsuites><testsuites/>','<testsuites><testcase name="bad"><failure/></testcase></testsuites>'):
                junit,meta,output=self.fixture(root,xml)
                with self.assertRaises(InvalidEvidence): collect_api(junit,meta,'a'*40,output)
            junit,meta,output=self.fixture(root)
            junit.unlink()
            with self.assertRaises(OSError): collect_api(junit,meta,'a'*40,output)

    def test_report_keeps_frontend_and_backend_counts_separate(self):
        evidence={'termination':'failed','assertions':[
            {'id':'browser-test-1','label':'Frontend checkout','status':'passed'},
            {'id':'api-test-1','label':'API test: pricing','status':'failed'},
            {'id':'api-test-2','label':'API test: cleanup','status':'skipped'}],
            'artifacts':[{'mediaType':'video/webm'}],'notCovered':['No production payments']}
        report=build('completed',evidence=evidence,review='Investigate API pricing failure.')
        self.assertEqual(report['evidence']['browserAssertions'],{'passed':1,'failed':0,'skipped':0})
        self.assertEqual(report['evidence']['apiAssertions'],{'passed':0,'failed':1,'skipped':1})
        self.assertIn('API test: pricing',html_report(report))
        self.assertIn('Backend API evidence',markdown(report))
        self.assertEqual(report['verification'],'unverified')
