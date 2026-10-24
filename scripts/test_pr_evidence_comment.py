import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from codex_ci_report import build
from evidence_tool import InvalidEvidence
from pr_evidence_comment import identity, publish, comment_body, source_data, upload_previews, publish_start, MEDIA_MARKER, GitHubError
import test_codex_evidence_review as fixtures

USER={'id':7,'login':'justafolk','type':'User'}


class Client:
    def __init__(self,user=None,sha='a'*40,comments=None):
        self.user=user or USER;self.sha=sha;self.comments=comments or [];self.mutations=[]
    def call(self,method,path,payload=None):
        if method=='GET' and path=='/user':return self.user
        if method=='GET' and '/pulls/' in path:return {'state':'open','draft':False,'head':{'sha':self.sha,'repo':{'full_name':'justafolk/sample-project-exhibit','fork':False}},'labels':[{'name':'agent-test'}]}
        self.mutations.append((method,path,payload))
        return {'id':99,'html_url':'https://github.com/justafolk/sample-project-exhibit/pull/2#issuecomment-99','user':USER}
    def pages(self,path,field=None):
        if field=='artifacts':return iter([{'id':1,'name':'codex-ci-report-pr-2-123-1'},{'id':2,'name':'exhibit-pr-2-123-1'}])
        return iter(self.comments)


def report():
    data=build('not_configured')
    data.update(pullRequest=2,headSha='a'*40,workflowRunId=123,attempt=1,runUrl='https://github.com/justafolk/sample-project-exhibit/actions/runs/123')
    return data


class PRCommentTests(unittest.TestCase):
    def test_only_real_owner_account_can_publish(self):
        self.assertEqual(identity(Client())['login'],'justafolk')
        for user in ({'id':1,'login':'github-actions[bot]','type':'Bot'},{'id':2,'login':'other','type':'User'}):
            client=Client(user=user)
            with self.assertRaises(InvalidEvidence):publish(client,Client(),report(),None,[])
            self.assertEqual(client.mutations,[])

    def test_posts_as_owner_and_updates_only_its_own_marker(self):
        data=report()
        unrelated={'id':44,'user':{'id':8},'body':'<!-- exhibit-evidence:v1:pr=2 -->'}
        user=Client(comments=[unrelated])
        with patch('pr_evidence_comment.upload_previews',return_value=[]):
            result=publish(user,Client(),data,None,[])
        self.assertEqual(result['author'],'justafolk')
        self.assertEqual(user.mutations[0][0],'POST')
        previous={'id':45,'user':USER,'body':user.mutations[0][2]['body'],'html_url':result['url']}
        user=Client(comments=[previous])
        with patch('pr_evidence_comment.upload_previews',return_value=[]):publish(user,Client(),data,None,[])
        self.assertEqual(user.mutations[0][0],'PATCH')
        self.assertTrue(user.mutations[0][1].endswith('/45'))

    def test_stale_head_and_newer_report_never_overwritten(self):
        user=Client(sha='b'*40)
        self.assertEqual(publish(user,Client(),report(),None,[])['status'],'skipped_stale')
        self.assertEqual(user.mutations,[])
        previous={'id':45,'user':USER,'body':'<!-- exhibit-evidence:v1:pr=2 -->\n<!-- exhibit-run:{"run":124,"attempt":1,"sha":"'+('a'*40)+'"} -->','html_url':'https://github.com/example'}
        user=Client(comments=[previous])
        self.assertEqual(publish(user,Client(),report(),None,[])['status'],'skipped_stale')
        self.assertEqual(user.mutations,[])

    def test_start_comment_has_exact_message_and_owner_and_is_updated(self):
        client=Client()
        result=publish_start(client,'a'*40,2,123,1)
        self.assertEqual(result['author'],'justafolk')
        body=client.mutations[0][2]['body']
        self.assertIn("\nhey i've started\n",body)
        previous={'id':45,'user':USER,'body':body,'html_url':result['url']}
        client=Client(comments=[previous])
        publish_start(client,'a'*40,2,124,1)
        self.assertEqual(client.mutations[0][0],'PATCH')
        stale=Client(sha='b'*40)
        self.assertEqual(publish_start(stale,'a'*40,2,124,1)['status'],'skipped_stale')
        self.assertEqual(stale.mutations,[])

    def test_comment_contains_report_links_previews_and_clear_limits(self):
        data=report()
        body=comment_body(data,None,[{'source':'express/checkout.webm','url':'https://github.com/justafolk/sample-project-exhibit/raw/'+'b'*40+'/preview.gif'}],{'report':'https://github.com/report','evidence':'https://github.com/videos'})
        self.assertIn('![express/checkout',body)
        self.assertIn('Full-resolution videos',body)
        self.assertIn('No agent was run',body)
        self.assertIn('No passing test counts',body)
        self.assertIn('Sample / Unverified',body)
        self.assertNotIn('<video',body)

    def test_bundle_binding_and_original_hashes_checked_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'report').mkdir();(root/'evidence').mkdir()
            manifest=fixtures.CodexReviewTests().bundle(root/'evidence')
            data=build('completed',evidence=manifest,review='Check address edge cases.')
            data.update(repository='justafolk/sample-project-exhibit',pullRequest=12,headSha='a'*40,workflowRunId=123,attempt=2)
            (root/'report/report.json').write_text(json.dumps(data))
            self.assertEqual(source_data(root,'a'*40,12,123,2)[1]['headSha'],'a'*40)
            data['evidence']['browserAssertions']['passed']=900
            (root/'report/report.json').write_text(json.dumps(data))
            with self.assertRaises(InvalidEvidence):source_data(root,'a'*40,12,123,2)
            data['evidence']['browserAssertions']['passed']=1
            (root/'report/report.json').write_text(json.dumps(data))
            (root/'evidence/test-results/video.webm').write_bytes(b'tamper bytes')
            with self.assertRaises(InvalidEvidence):source_data(root,'a'*40,12,123,2)

    def test_refuses_existing_unowned_asset_branch(self):
        class Media:
            def call(self,method,path,payload=None):
                if path.endswith('/git/blobs'):return {'sha':'b'*40}
                if '/git/ref/' in path:return {'object':{'sha':'c'*40}}
                if '/contents/' in path:return {'content':'dW5yZWxhdGVk'}
                raise AssertionError('An unowned branch must not be mutated')
        with self.assertRaises(InvalidEvidence):upload_previews(Media(),2,[{'data':b'GIF89a bytes','source':'video.webm'}])
