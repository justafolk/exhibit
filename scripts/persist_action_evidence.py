#!/usr/bin/env python3
"""Archive a completed evidence workflow without checking out or executing PR code.

Only named evidence/report artifacts and GitHub's masked job logs are read. The
repository-scoped ingestion secret is sent only to the configured HTTPS origin.
"""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

from evidence_tool import validate_manifest, verify_artifacts

MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MEDIA = {'.webm':'video/webm', '.mp4':'video/mp4', '.png':'image/png', '.gif':'image/gif',
         '.jpg':'image/jpeg', '.zip':'application/zip', '.json':'application/json',
         '.txt':'text/plain', '.log':'text/plain', '.md':'text/markdown',
         '.html':'text/html', '.xml':'application/xml'}

class ArchiveError(ValueError):
    pass

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme != 'https' or target.username or target.password:
            raise ArchiveError('Unsafe HTTP redirect')
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if result and target.netloc != urlsplit(req.full_url).netloc:
            result.remove_header('Authorization')
        return result

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def safe_path(value):
    p = PurePosixPath(value)
    if (not value or len(value)>500 or str(p)!=value or p.is_absolute()
            or any(part in ('.','..') for part in p.parts)
            or any(ord(c)<32 for c in value) or '\\' in value or ':' in value):
        raise ArchiveError('Unsafe artifact path')
    return p


def unpack(raw, root, remaining):
    total = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        seen = set()
        for item in bundle.infolist():
            if item.is_dir():
                continue
            safe_path(item.filename)
            if ((item.external_attr >> 16) & 0o170000) == 0o120000 or item.filename in seen:
                raise ArchiveError('Duplicate or symbolic artifact file')
            seen.add(item.filename)
            total += item.file_size
            if item.file_size > MAX_FILE or total > remaining or len(seen)>500:
                raise ArchiveError('Artifact exceeds archive limits')
            if Path(item.filename).suffix.lower() not in MEDIA:
                raise ArchiveError('Unsupported artifact file; archive is incomplete')
            target = root / item.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(item) as source, target.open('xb') as dest:
                while chunk := source.read(1024*1024):
                    dest.write(chunk)
    return total


def request(url, token, method='GET', data=None, binary=False, limit=MAX_TOTAL, redirects=False):
    headers = {'Authorization':'Bearer '+token, 'Accept':'application/vnd.github+json'}
    if isinstance(data, (dict,list)):
        data = json.dumps(data, separators=(',',':')).encode()
        headers['Content-Type'] = 'application/json'
    elif data is not None:
        headers['Content-Type'] = 'application/octet-stream'
        headers['Content-Length'] = str(os.fstat(data.fileno()).st_size)
    opener = build_opener(SafeRedirect() if redirects else NoRedirect())
    for attempt in range(3):
        if hasattr(data, 'seek'):
            data.seek(0)
        try:
            with opener.open(Request(url, data=data, headers=headers, method=method), timeout=120) as response:
                raw = response.read(limit+1)
                if len(raw)>limit:
                    raise ArchiveError('Response exceeds archive limits')
                return raw if binary else json.loads(raw)
        except HTTPError as error:
            if error.code not in (429,502,503,504) or attempt==2:
                raise ArchiveError(f'Archive HTTP request failed ({error.code}); credentials and response suppressed') from None
        except (URLError, TimeoutError, ConnectionError):
            if attempt==2:
                raise ArchiveError('Archive network request failed; credentials and response suppressed') from None
        time.sleep(2**attempt)


def inventory(root):
    result=[];total=0
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ArchiveError('Symbolic files are not allowed')
        if not file.is_file():
            continue
        relative=file.relative_to(root).as_posix();safe_path(relative)
        size=file.stat().st_size
        if size==0:
            continue
        total+=size
        if size>MAX_FILE or total>MAX_TOTAL or len(result)>=500:
            raise ArchiveError('Archive exceeds upload limits')
        media=MEDIA.get(file.suffix.lower())
        if not media:
            raise ArchiveError('Unsupported output type')
        digest=hashlib.sha256()
        with file.open('rb') as source:
            while chunk:=source.read(1024*1024):digest.update(chunk)
        result.append(dict(id='', uploaded=False, path=relative, mediaType=media, bytes=size, sha256=digest.hexdigest()))
    return result


def provenance(value, repository, pr, sha, run_id, attempt, report=False):
    expected = {'repository':repository, 'pullRequest':pr, 'headSha':sha,
                'workflowRunId' if report else 'runId':run_id if report else f'sample-pr-{run_id}', 'attempt':attempt}
    if any(value.get(k)!=v for k,v in expected.items()):
        raise ArchiveError('Output provenance does not match the completed workflow attempt')


def archive(origin, token, github_token, repository, run_id, attempt_number, workdir):
    parsed=urlsplit(origin)
    if parsed.scheme!='https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
        raise ArchiveError('EXHIBIT_INGEST_URL must be an HTTPS origin without a path')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repository) or not run_id.isdigit():
        raise ArchiveError('Invalid workflow identity')
    api=f'https://api.github.com/repos/{repository}'
    gh=lambda path,**kw:request(api+path,github_token,redirects=True,**kw)
    
    if not str(attempt_number).isdigit() or int(attempt_number)<1:
        raise ArchiveError('Invalid workflow attempt')
    run=gh(f'/actions/runs/{run_id}/attempts/{attempt_number}')
    if run.get('status')!='completed' or run.get('event')!='pull_request' or run.get('repository',{}).get('full_name','').lower()!=repository.lower():
        raise ArchiveError('Expected a completed same-repository pull_request workflow')
    # GitHub run metadata supplies PR identity, independent of artifact contents.
    prs=run.get('pull_requests',[])
    if len(prs)!=1 or prs[0].get('head',{}).get('repo',{}).get('id')!=run['repository']['id']:
        raise ArchiveError('Forks or ambiguous pull request identities are not eligible')
    pr=prs[0]['number'];sha=prs[0]['head']['sha'];attempt=run['run_attempt'];rid=int(run_id)
    # Resolve the selected attempt, rather than accidentally mixing a rerun's files.
    jobs=[];page=1
    while True:
        batch=gh(f'/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}')['jobs'];jobs+=batch
        if len(batch)<100:break
        page+=1
        if page>10:raise ArchiveError('Too many jobs')
    artifacts=[];page=1
    while True:
        batch=gh(f'/actions/runs/{run_id}/artifacts?per_page=100&page={page}')['artifacts'];artifacts+=batch
        if len(batch)<100:break
        page+=1
        if page>10:raise ArchiveError('Too many artifacts')
    root=Path(workdir);root.mkdir(parents=True,exist_ok=True)
    selected=[];total=0
    names={f'exhibit-pr-{pr}-{run_id}-{attempt}':'evidence',f'codex-ci-report-pr-{pr}-{run_id}-{attempt}':'codex'}
    for stage in ('evidence','codex','publish'):
        names[f'exhibit-job-output-{stage}-{pr}-{run_id}-{attempt}']='outputs/'+stage
    for artifact in artifacts:
        if artifact['name'] not in names:continue
        if artifact.get('expired'):raise ArchiveError('Required workflow artifact expired; cannot save a complete archive')
        selected.append(artifact)
        destination=root/names[artifact['name']];destination.mkdir(parents=True)
        raw=gh(f"/actions/artifacts/{artifact['id']}/zip",binary=True)
        total+=unpack(raw,destination,MAX_TOTAL-total)
    gaps=[];manifest=None;codex=None;assertions=[]
    mpath=root/'evidence/.local/evidence/manifest.json'
    if mpath.exists():
        
        if mpath.stat().st_size>256*1024:raise ArchiveError('Manifest is too large')
        manifest=json.loads(mpath.read_text());validate_manifest(manifest,sha)
        provenance(manifest,repository,pr,sha,rid,attempt)
        verify_artifacts(manifest,root/'evidence/test-results')
        assertions=[dict(label=a['label'],status=a['status']) for a in manifest['assertions']]
        gaps+=manifest['notCovered']
    else:gaps.append('No evidence manifest was produced; see original job logs for failed or skipped stages.')
    cpath=root/'codex/report.json'
    if cpath.exists():
        
        if cpath.stat().st_size>2*1024*1024:raise ArchiveError('Codex report is too large')
        codex=json.loads(cpath.read_text());provenance(codex,repository,pr,sha,rid,attempt,True)
    else:gaps.append('No Codex CI report was produced for this attempt.')
    # Job logs come from the completed producer, never from the upload job.
    for job in jobs:
        if job.get('conclusion')=='skipped':continue
        try:
            logs=gh(f"/actions/jobs/{job['id']}/logs",binary=True,limit=MAX_FILE)
        except ArchiveError as error:
            if '(404)' not in str(error) and '(410)' not in str(error):raise
            gaps.append(f"Job {job['id']} has no retrievable log (not produced or expired).")
            continue
        total+=len(logs)
        if total>MAX_TOTAL:raise ArchiveError('Combined job logs and artifacts exceed upload limit')
        target=root/f"jobs/{job['id']}.log";target.parent.mkdir(exist_ok=True);target.write_bytes(logs)
    outputs={}
    for stage in ('evidence','codex','publish'):
        output_path=root/f'outputs/{stage}/steps.json'
        if output_path.exists():
            if output_path.stat().st_size>256*1024:raise ArchiveError('Job output metadata is too large')
            outputs[stage]=json.loads(output_path.read_text())
    workflow={'run':run,'jobs':jobs,'artifacts':selected,'outputs':outputs}
    (root/'workflow.json').write_text(json.dumps(workflow,indent=2)+'\n')
    if manifest is not None and not assertions:
        gaps.append('No individual test assertions were captured.')
    from datetime import datetime
    duration=max(0,int((datetime.fromisoformat(run['updated_at'].replace('Z','+00:00'))-datetime.fromisoformat(run['created_at'].replace('Z','+00:00'))).total_seconds()))
    conclusion=run.get('conclusion')
    outcome='success' if conclusion=='success' else 'cancelled' if conclusion=='cancelled' else 'skipped' if conclusion=='skipped' else 'failure'
    payload=dict(repository=repository,pullRequest=pr,title=run.get('display_title') or f'PR #{pr} evidence',headSha=sha,workflowRunId=rid,attempt=attempt,startedAt=run['created_at'],durationSeconds=duration,outcome=outcome,assertions=assertions,notCovered=gaps,manifest=manifest,codexReport=codex,workflow=workflow,files=inventory(root))
    if len(json.dumps(payload).encode())>4*1024*1024:raise ArchiveError('Report metadata exceeds ingestion limit')
    base=origin.rstrip('/')+'/api/ingest/v1/runs'
    record=request(base,token,'POST',payload,limit=8*1024*1024)
    for item in record['submission']['files']:
        if item['uploaded']:continue
        # Server IDs never determine local paths; match against the submitted inventory.
        if item['path'] not in {f['path'] for f in payload['files']}:raise ArchiveError('Unexpected upload path')
        with (root/item['path']).open('rb') as file:
            request(base+'/'+record['runId']+'/files/'+item['id'],token,'PUT',file)
    record=request(base+'/'+record['runId']+'/complete',token,'POST')
    if not record['complete']:raise ArchiveError('Server did not confirm complete archive')
    return origin.rstrip('/')+'/#/runs/'+record['runId']


def main():
    required=('EXHIBIT_INGEST_URL','EXHIBIT_INGEST_TOKEN','GH_TOKEN','GITHUB_REPOSITORY','SOURCE_RUN_ID','SOURCE_RUN_ATTEMPT')
    for key in required:
        if not os.environ.get(key):raise ArchiveError('Missing required configuration: '+key)
    with tempfile.TemporaryDirectory(prefix='exhibit-archive-') as directory:
        url=archive(*(os.environ[key] for key in required),directory)
    print('Saved CI evidence: '+url)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('report-url='+url+'\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write('Evidence and reports saved to the private workspace: '+url+'\n')

if __name__=='__main__':
    try:main()
    except (ArchiveError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        # Only our bounded messages are printable; upstream data/errors may contain secrets.
        print(str(error) if isinstance(error,ArchiveError) else 'Evidence archive failed; inspect source workflow and configuration.',file=sys.stderr)
        sys.exit(1)
