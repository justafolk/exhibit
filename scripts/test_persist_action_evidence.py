import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.request import Request
import zipfile

from persist_action_evidence import ArchiveError, SafeRedirect, archive, inventory, unpack

REPO='acme/app'
RUN={'id':123,'run_attempt':2,'status':'completed','event':'pull_request',
     'repository':{'id':1,'full_name':REPO},'pull_requests':[{'number':7,'head':{'sha':'a'*40,'repo':{'id':1}}}],
     'created_at':'2026-01-01T00:00:00Z','updated_at':'2026-01-01T00:01:00Z','conclusion':'success','display_title':'Checkout'}


def bundle(files):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as out:
        for key,value in files.items():out.writestr(key,value)
    return stream.getvalue()


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.calls=[];self.payload=None;self.uploads={};self.run=copy.deepcopy(RUN)
        manifest=json.loads((Path(__file__).resolve().parents[1]/'agents/examples/manifest.json').read_text())
        manifest.update(repository=REPO,pullRequest=7,headSha='a'*40,runId='sample-pr-123',attempt=2,termination='completed')
        manifest['assertions']=[dict(id='api',label='API order status',status='passed')]
        video=b'recorded-original-video'
        manifest['artifacts']=[dict(path='browser/video.webm',mediaType='video/webm',bytes=len(video),sha256=hashlib.sha256(video).hexdigest())]
        self.evidence=bundle({'.local/evidence/manifest.json':json.dumps(manifest),'test-results/browser/video.webm':video,'.local/evidence/playwright.json':'{"stats":{}}'})
        report={'repository':REPO,'pullRequest':7,'headSha':'a'*40,'workflowRunId':123,'attempt':2,'status':'completed','review':'Add a timeout test.'}
        self.report=bundle({'report.json':json.dumps(report),'report.html':'<h1>Advice</h1>','report.md':'Advice'})
        self.artifacts=[{'id':11,'name':'exhibit-pr-7-123-2','expired':False},{'id':12,'name':'codex-ci-report-pr-7-123-2','expired':False},{'id':13,'name':'unrelated-sensitive-files','expired':False}]

    def request(self,url,token,method='GET',data=None,**kwargs):
        self.calls.append((url,token,method))
        if url.startswith('https://api.github.com'):
            self.assertEqual(token,'github-read-token')
            if url.endswith('/attempts/2'):return self.run
            if '/jobs?' in url:return {'jobs':[{'id':21,'conclusion':'success','steps':[{'name':'API','conclusion':'success'}]}]}
            if '/artifacts?' in url:return {'artifacts':self.artifacts}
            if url.endswith('/artifacts/11/zip'):return self.evidence
            if url.endswith('/artifacts/12/zip'):return self.report
            if url.endswith('/jobs/21/logs'):return b'API passed\nGitHub masked: ***\n'
            self.fail('Unexpected GitHub request: '+url)
        self.assertEqual(token,'private-upload-token')
        if url.endswith('/runs'):
            self.payload=copy.deepcopy(data)
            files=[{**f,'id':str(i),'uploaded':False} for i,f in enumerate(data['files'])]
            return {'runId':'ci-saved','submission':{'files':files}}
        if '/files/' in url:
            self.uploads[url.rsplit('/',1)[-1]]=data.read()
            return {'uploaded':True}
        if url.endswith('/complete'):return {'runId':'ci-saved','complete':True}
        self.fail('Unexpected ingestion request')

    def run_archive(self):
        with tempfile.TemporaryDirectory() as directory,patch('persist_action_evidence.request',side_effect=self.request):
            return archive('https://exhibit.example','private-upload-token','github-read-token',REPO,'123','2',directory)

    def test_reports_recordings_logs_and_original_hashes_are_preserved(self):
        self.assertEqual(self.run_archive(),'https://exhibit.example/#/runs/ci-saved')
        self.assertEqual(self.payload['attempt'],2)
        self.assertEqual(self.payload['outcome'],'success')
        self.assertEqual(self.payload['codexReport']['review'],'Add a timeout test.')
        self.assertEqual(self.payload['assertions'][0]['status'],'passed')
        self.assertEqual(len(self.uploads),len(self.payload['files']))
        for i,file in enumerate(self.payload['files']):
            self.assertEqual(hashlib.sha256(self.uploads[str(i)]).hexdigest(),file['sha256'])
        paths=[f['path'] for f in self.payload['files']]
        self.assertIn('evidence/test-results/browser/video.webm',paths)
        self.assertIn('codex/report.html',paths)
        self.assertIn('jobs/21.log',paths)
        self.assertFalse(any('/artifacts/13/zip' in u for u,_,_ in self.calls))

    def test_failure_before_artifacts_is_stored_with_gaps_and_logs(self):
        self.artifacts=[];self.run['conclusion']='failure'
        self.run_archive()
        self.assertEqual(self.payload['outcome'],'failure')
        self.assertIsNone(self.payload['manifest']);self.assertIsNone(self.payload['codexReport'])
        self.assertEqual(len(self.payload['notCovered']),2)
        self.assertIn('jobs/21.log',[f['path'] for f in self.payload['files']])

    def test_fork_running_expired_and_stale_attempt_are_rejected(self):
        for mutate in (lambda:self.run.update(status='in_progress'),lambda:self.run['pull_requests'][0]['head']['repo'].update(id=9),lambda:self.artifacts[0].update(expired=True),lambda:self.run['pull_requests'][0]['head'].update(sha='b'*40)):
            self.setUp();mutate()
            with self.assertRaises(ValueError):self.run_archive()
            self.assertIsNone(self.payload)

    def test_zip_traversal_symlink_duplicates_and_limits(self):
        for name in ('../escape.json','/escape.json','a/../../escape.json','a\\escape.json'):
            with tempfile.TemporaryDirectory() as directory,self.assertRaises(ArchiveError):unpack(bundle({name:'data'}),Path(directory),1024)
        with tempfile.TemporaryDirectory() as directory,self.assertRaises(ArchiveError):unpack(bundle({'file.json':'too large'}),Path(directory),2)
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as out:
            item=zipfile.ZipInfo('symlink.json');item.external_attr=0o120777<<16;out.writestr(item,'target')
        with tempfile.TemporaryDirectory() as directory,self.assertRaises(ArchiveError):unpack(raw.getvalue(),Path(directory),1024)

    def test_unsafe_origin_is_rejected_before_token_is_sent(self):
        for origin in ('http://exhibit.example','https://token@example.com','https://example.com/#/overview','https://example.com/api'):
            with self.assertRaises(ArchiveError),tempfile.TemporaryDirectory() as directory:
                archive(origin,'private-upload-token','gh',REPO,'123','2',directory)

    def test_github_redirect_drops_bearer_on_storage_host(self):
        req=Request('https://api.github.com/archive',headers={'Authorization':'Bearer github-read-token'})
        redirect=SafeRedirect().redirect_request(req,None,302,'Found',{},'https://storage.example/archive.zip')
        self.assertIsNone(redirect.get_header('Authorization'))
        with self.assertRaises(ArchiveError):SafeRedirect().redirect_request(req,None,302,'Found',{},'http://storage.example/archive.zip')

    def test_inventory_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'original.json').write_text('{}');(root/'link.json').symlink_to(root/'original.json')
            with self.assertRaises(ArchiveError):inventory(root)

if __name__=='__main__':unittest.main()
