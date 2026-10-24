#!/usr/bin/env python3
"""Publish one user-authored sample PR report; never run PR code or media decoders."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from codex_ci_report import markdown as report_markdown, build as build_report
from evidence_tool import InvalidEvidence, read_json, require, validate_manifest, verify_artifacts, markdown

REPOSITORY = 'justafolk/sample-project-exhibit'
OWNER = 'justafolk'
MEDIA_BRANCH = 'exhibit-evidence-previews'
MEDIA_MARKER = b'exhibit-generated-previews:v1\n'


class GitHubError(Exception):
    def __init__(self, status, method='', path=''):
        self.status = status
        super().__init__(f"GitHub API returned HTTP {status} during {method} {path.split('?')[0]}")


class GitHub:
    def __init__(self, token):
        self.token = token

    def call(self, method, path, payload=None):
        require(path.startswith('/') and not path.startswith('//'), 'invalid GitHub API path')
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request('https://api.github.com'+path, data=data, method=method,
                          headers={'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json',
                                   'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read(16*1024*1024+1)
                require(len(raw) <= 16*1024*1024, 'GitHub response exceeded limit')
                return json.loads(raw) if raw else None
        except HTTPError as error:
            raise GitHubError(error.code,method,path) from None

    def pages(self, path, field=None):
        for page in range(1,11):
            response=self.call('GET',f'{path}?per_page=100&page={page}')
            entries=response[field] if field else response
            yield from entries
            if len(entries)<100:
                return
        raise InvalidEvidence('GitHub pagination exceeded limit; refusing an incomplete update')


def identity(client):
    user=client.call('GET','/user')
    require(user.get('login') == OWNER and user.get('type') == 'User',
            'EXHIBIT_COMMENT_TOKEN must authenticate the @justafolk user; bot fallback is forbidden')
    return user


def source_data(bundle, sha, pr, run, attempt):
    root=Path(bundle)
    for relative in ('report','report/report.json','evidence','evidence/.local','evidence/.local/evidence','evidence/.local/evidence/manifest.json','evidence/test-results'):
        require(not (root/relative).is_symlink(),'publication bundle symlinks are forbidden')
    report=read_json(root/'report/report.json')
    require(report.get('schemaVersion') == 1 and report.get('repository') == REPOSITORY,
            'unsupported or wrong report repository')
    require(report.get('pullRequest') == pr and report.get('headSha') == sha and
            report.get('workflowRunId') == run and report.get('attempt') == attempt, 'wrong report provenance')
    require(report.get('status') in ('completed','failed','not_configured') and
            report.get('verification') == 'unverified' and report.get('advisory') is True, 'unsupported report status')
    manifest_path=root/'evidence/.local/evidence/manifest.json'
    manifest=None; previews=[]
    if manifest_path.is_file():
        manifest=read_json(manifest_path)
        validate_manifest(manifest,sha)
        require(manifest['repository'] == REPOSITORY and manifest['pullRequest'] == pr and
                manifest['runId'] == f'sample-pr-{run}' and manifest['attempt'] == attempt, 'wrong evidence provenance')
        require(manifest['sample'] is True, 'only sample evidence can be published')
        artifacts_root=root/'evidence/test-results'
        verify_artifacts(manifest,artifacts_root)
        index_path=manifest_path.with_name('previews.json')
        require(not index_path.is_symlink(),'preview index cannot be a symlink')
        if index_path.is_file():
            index=read_json(index_path)
            require(index.get('headSha') == sha and index.get('pullRequest') == pr and
                    index.get('runId') == manifest['runId'] and index.get('attempt') == attempt,
                    'wrong preview provenance')
            entries=index.get('previews')
            require(type(entries) is list and len(entries)<=4,'invalid preview index')
            for entry in entries:
                image,video=entry['preview'],entry['video']
                require(image in manifest['artifacts'] and image['mediaType']=='image/gif' and
                        video in manifest['artifacts'] and video['mediaType'] in ('video/webm','video/mp4'),
                        'preview is not bound to checked original media')
                data=(artifacts_root/image['path']).read_bytes()
                require(data[:6] in (b'GIF87a',b'GIF89a') and len(data)<=5*1024*1024,'invalid preview bytes')
                previews.append({'data':data,'source':video['path'],'sourceSha256':video['sha256']})
    require(not report.get('evidenceValidated') or manifest is not None,'validated report is missing source evidence')
    if report.get('evidenceValidated'):
        require(report.get('evidence') == build_report('completed',evidence=manifest)['evidence'],
                'report counts or test results disagree with source evidence')
    else:
        require(report.get('evidence') is None,'unvalidated report cannot claim test counts')
    report['runUrl']=f'https://github.com/{REPOSITORY}/actions/runs/{run}'
    return report,manifest,previews


def upload_previews(client, pr, previews):
    if not previews:
        return []
    prefix=f'/repos/{REPOSITORY}'
    blobs=[]
    for index,preview in enumerate(previews,1):
        blob=client.call('POST',prefix+'/git/blobs',{'content':base64.b64encode(preview['data']).decode(),'encoding':'base64'})
        blobs.append({'path':f'previews/pr-{pr}/recording-{index:02}.gif','mode':'100644','type':'blob','sha':blob['sha']})
    marker=client.call('POST',prefix+'/git/blobs',{'content':base64.b64encode(MEDIA_MARKER).decode(),'encoding':'base64'})
    for retry in range(3):
        try:
            ref=client.call('GET',prefix+f'/git/ref/heads/{MEDIA_BRANCH}')
        except GitHubError as error:
            if error.status != 404: raise
            ref=None
        base=None
        if ref:
            # Never overwrite an existing branch that was not created by Exhibit.
            owned=client.call('GET',prefix+f'/contents/.exhibit-generated?ref={MEDIA_BRANCH}')
            require(base64.b64decode(owned['content']) == MEDIA_MARKER,'existing preview branch is not owned by Exhibit')
            base=client.call('GET',prefix+'/git/commits/'+ref['object']['sha'])['tree']['sha']
        payload={'tree':blobs+[{'path':'.exhibit-generated','mode':'100644','type':'blob','sha':marker['sha']}]}
        if base: payload['base_tree']=base
        tree=client.call('POST',prefix+'/git/trees',payload)
        commit=client.call('POST',prefix+'/git/commits',{'message':f'Update generated evidence previews for PR #{pr}',
            'tree':tree['sha'],'parents':[ref['object']['sha']] if ref else []})
        try:
            if ref:
                client.call('PATCH',prefix+f'/git/refs/heads/{MEDIA_BRANCH}',{'sha':commit['sha'],'force':False})
            else:
                client.call('POST',prefix+'/git/refs',{'ref':f'refs/heads/{MEDIA_BRANCH}','sha':commit['sha']})
            return [{'url':f"https://github.com/{REPOSITORY}/raw/{commit['sha']}/{blob['path']}",
                     'source':preview['source']} for blob,preview in zip(blobs,previews)]
        except GitHubError as error:
            if error.status not in (409,422) or retry==2: raise
    raise InvalidEvidence('preview update did not complete')


def artifact_links(client, pr, run, attempt):
    expected={f'exhibit-pr-{pr}-{run}-{attempt}':'evidence', f'codex-ci-report-pr-{pr}-{run}-{attempt}':'report'}
    links={}
    for artifact in client.pages(f'/repos/{REPOSITORY}/actions/runs/{run}/artifacts','artifacts'):
        if artifact['name'] in expected and not artifact.get('expired'):
            links[expected[artifact['name']]]=f"https://github.com/{REPOSITORY}/actions/runs/{run}/artifacts/{artifact['id']}"
    require('report' in links,'completed CI report artifact is unavailable')
    return links


def comment_body(report, manifest, images, links):
    pr,run,attempt=report['pullRequest'],report['workflowRunId'],report['attempt']
    stamp=json.dumps({'run':run,'attempt':attempt,'sha':report['headSha']},separators=(',',':'))
    lines=[f'<!-- exhibit-evidence:v1:pr={pr} -->',f'<!-- exhibit-run:{stamp} -->','## Exhibit PR evidence','',
           'Automated report published with the account owner’s authorization. **Sample / Unverified.**','',
           f"Commit: `{report['headSha']}` · Run {run}, attempt {attempt}",'',
           f"[Complete HTML / Markdown / JSON report]({links['report']}) · [Workflow]({report['runUrl']})",'']
    if 'evidence' in links:
        lines += [f"[Full-resolution videos, traces, screenshots and raw API results]({links['evidence']}) (artifact retention: 7 days)",'']
    if manifest:
        def counts(api):
            selected=[a for a in manifest['assertions'] if a['id'].startswith('api-')==api]
            return [sum(a['status']==status for a in selected) for status in ('passed','failed','skipped')]
        lines += ['| Checks | Passed | Failed | Skipped |','| --- | ---: | ---: | ---: |',
                  '| Frontend browser | '+' | '.join(map(str,counts(False)))+' |',
                  '| Backend API | '+' | '.join(map(str,counts(True)))+' |','',
                  'Original artifact sizes and SHA-256 hashes were checked. This does not establish a trusted verdict.','']
    else:
        lines += ['Source evidence was not available for validation. No passing test counts are claimed.','']
    if images:
        lines += ['### Animated recording previews','',
                  'Embedded GIF previews show at most the first 20 seconds of each recording. Full video files are linked above.','']
        for image in sorted(images,key=lambda item:('express' not in item['source'],item['source'])):
            lines += [f"![{markdown(image['source'])}]({image['url']})",'']
    else:
        lines += ['No animated recording preview was produced for this attempt.','']
    lines += ['<details><summary>Full report, individual test results, Codex suggestions and limits</summary>','',
              report_markdown(report),'</details>','',
              'Codex advice is advisory, and this integration reviews recording metadata rather than watching video contents.']
    body='\n'.join(lines)
    require(len(body)<=60000,'PR report is too large; refusing to truncate evidence')
    return body



def publish_start(client, sha, pr, run, attempt):
    user=identity(client)
    current=client.call('GET',f'/repos/{REPOSITORY}/pulls/{pr}')
    if current.get('state')!='open' or current.get('draft') or current['head']['sha']!=sha or not any(x['name']=='agent-test' for x in current.get('labels',[])):
        return {'status':'skipped_stale','url':None}
    require(current['head']['repo']['full_name']==REPOSITORY and current['head']['repo'].get('fork') is False,
            'starting is limited to same-repository sample PRs')
    marker=f'<!-- exhibit-start:v1:pr={pr} -->'
    previous=None
    for comment in client.pages(f'/repos/{REPOSITORY}/issues/{pr}/comments'):
        if comment.get('user',{}).get('id')==user['id'] and marker in comment.get('body',''):
            previous=comment
            stamp=re.search(r'<!-- exhibit-run:(\{[^\n]+\}) -->',comment['body'])
            if stamp:
                old=json.loads(stamp.group(1))
                if (old['run'],old['attempt'])>(run,attempt):return {'status':'skipped_stale','url':comment['html_url']}
    stamp=json.dumps({'run':run,'attempt':attempt,'sha':sha},separators=(',',':'))
    body=f"{marker}\n<!-- exhibit-run:{stamp} -->\nhey i've started\n\nAutomated frontend video and backend API testing for `{sha}`.\n\n[Follow run {run}, attempt {attempt}](https://github.com/{REPOSITORY}/actions/runs/{run})\n\nThe completed evidence and Codex report will be posted separately."
    if previous:
        result=client.call('PATCH',f"/repos/{REPOSITORY}/issues/comments/{previous['id']}",{'body':body})
    else:
        result=client.call('POST',f'/repos/{REPOSITORY}/issues/{pr}/comments',{'body':body})
    require(result.get('user',{}).get('id')==user['id'],'GitHub returned an unexpected start-comment author')
    return {'status':'published','url':result['html_url'],'author':OWNER}


def publish(user_client, media_client, report, manifest, previews):
    user=identity(user_client)
    pr=report['pullRequest']; sha=report['headSha']; run=report['workflowRunId']; attempt=report['attempt']
    current=user_client.call('GET',f'/repos/{REPOSITORY}/pulls/{pr}')
    if current.get('state')!='open' or current.get('draft') or current['head']['sha']!=sha or not any(x['name']=='agent-test' for x in current.get('labels',[])):
        return {'status':'skipped_stale','url':None}
    require(current['head']['repo']['full_name']==REPOSITORY and current['head']['repo'].get('fork') is False,
            'publishing is limited to same-repository sample PRs')
    marker=f'<!-- exhibit-evidence:v1:pr={pr} -->'
    previous=None
    for comment in user_client.pages(f'/repos/{REPOSITORY}/issues/{pr}/comments'):
        if comment.get('user',{}).get('id')==user['id'] and marker in comment.get('body',''):
            previous=comment
            stamp=re.search(r'<!-- exhibit-run:(\{[^\n]+\}) -->',comment['body'])
            if stamp:
                old=json.loads(stamp.group(1))
                if (old['run'],old['attempt'])>(run,attempt): return {'status':'skipped_stale','url':comment['html_url']}
    links=artifact_links(media_client,pr,run,attempt)
    images=upload_previews(media_client,pr,previews)
    body=comment_body(report,manifest,images,links)
    latest=user_client.call('GET',f'/repos/{REPOSITORY}/pulls/{pr}')
    if latest.get('state')!='open' or latest.get('draft') or latest['head']['sha']!=sha or not any(x['name']=='agent-test' for x in latest.get('labels',[])):
        return {'status':'skipped_stale','url':None}
    if previous:
        result=user_client.call('PATCH',f"/repos/{REPOSITORY}/issues/comments/{previous['id']}",{'body':body})
    else:
        result=user_client.call('POST',f'/repos/{REPOSITORY}/issues/{pr}/comments',{'body':body})
    require(result.get('user',{}).get('id')==user['id'],'GitHub returned an unexpected comment author')
    return {'status':'published','url':result['html_url'],'author':OWNER}


def main():
    try:
        token=os.environ.get('EXHIBIT_COMMENT_TOKEN','')
        require(bool(token),'Configure EXHIBIT_COMMENT_TOKEN for @justafolk; bot fallback is forbidden')
        sha=os.environ['EXPECTED_SHA']; pr=int(os.environ['EXPECTED_PR']); run=int(os.environ['EXPECTED_RUN_ID']); attempt=int(os.environ['EXPECTED_ATTEMPT'])
        phase=os.environ.get('PUBLISH_PHASE','completed')
        require(phase in ('start','completed'),'unsupported comment phase')
        if phase=='start':
            result=publish_start(GitHub(token),sha,pr,run,attempt)
        else:
            report,manifest,previews=source_data(os.environ['COMMENT_BUNDLE'],sha,pr,run,attempt)
            result=publish(GitHub(token),GitHub(os.environ['MEDIA_TOKEN']),report,manifest,previews)
        with open(os.environ['GITHUB_OUTPUT'],'a') as output:
            output.write(f"status={result['status']}\ncomment-url={result['url'] or ''}\n")
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as summary:
            summary.write(f"\n## PR evidence comment\n\nStatus: {result['status']}\n\n"+(f"[Comment by @{OWNER}]({result['url']})\n" if result['url'] else 'PR changed or closed; no stale report posted.\n'))
        print(f"PR report comment: {result['status']}")
        return 0
    except InvalidEvidence as error:
        print(f'PR comment publication failed: {error}',file=sys.stderr)
        return 1
    except GitHubError as error:
        print(f'PR comment publication failed: {error}',file=sys.stderr)
        return 1
    except (OSError,ValueError,KeyError) as error:
        # No token or raw response/provider content is included in these diagnostics.
        print(f'PR comment publication failed ({type(error).__name__}). Check the account binding, artifact provenance and GitHub token scopes.',file=sys.stderr)
        return 1


if __name__=='__main__':
    sys.exit(main())
