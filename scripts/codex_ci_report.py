#!/usr/bin/env python3
"""Write portable, advisory Codex CI reports without credentials or raw logs."""
from datetime import datetime, timezone
import html
import json
import os
from pathlib import Path
import re
import sys


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def metadata():
    def integer(name):
        value = os.environ.get(name, '')
        return int(value) if value.isdecimal() and len(value) <= 20 else None
    sha = os.environ.get('EXPECTED_SHA', '')
    return {'repository': 'justafolk/sample-project-exhibit', 'pullRequest': integer('EXPECTED_PR'),
            'headSha': sha if re.fullmatch('[a-f0-9]{40}', sha) else None,
            'workflowRunId': integer('EXPECTED_RUN_ID'), 'attempt': integer('EXPECTED_ATTEMPT')}


def build(status, *, evidence=None, review=None, failure=None, started_at=None):
    if status not in ('completed', 'not_configured', 'failed'):
        raise ValueError('Unsupported Codex report status')
    source = None
    if evidence is not None:
        def counts(api):
            return {state: sum(a['status'] == state and a.get('id','').startswith('api-') == api for a in evidence['assertions'])
                    for state in ('passed', 'failed', 'skipped')}
        has_api = any(a.get('id','').startswith('api-') for a in evidence['assertions'])
        source = {'termination': evidence['termination'], 'browserAssertions': counts(False), 'apiAssertions': counts(True) if has_api else None,
                  'recordings': sum(a['mediaType'].startswith('video/') for a in evidence['artifacts']),
                  'artifacts': len(evidence['artifacts']), 'coverageGaps': evidence['notCovered'],
                  'testResults': [{'id':a.get('id',''), 'label':a.get('label','Unnamed test'), 'status':a['status']} for a in evidence['assertions']]}
    data = {'schemaVersion': 1, **metadata(), 'status': status, 'advisory': True,
            'verification': 'unverified', 'cliVersion': '0.164.0',
            'startedAt': started_at, 'finishedAt': now(), 'evidenceValidated': evidence is not None,
            'evidence': source, 'review': review if status == 'completed' else None,
            'failure': failure if status == 'failed' else None,
            'limitations': ['Agent advice cannot change deterministic test results or verification.',
                            'Codex reviewed test assertions and recording metadata, not video contents.',
                            'API test counts are shown only when backend results were captured and validated.']}
    run_id = data['workflowRunId']
    data['runUrl'] = f"https://github.com/{data['repository']}/actions/runs/{run_id}" if run_id else None
    return data


def markdown(data):
    lines = ['## Codex CI report', '', f"**Codex status: {data['status']}** · Advisory · Unverified", '',
             f"- Repository: `{data['repository']}`", f"- PR: {data['pullRequest']}",
             f"- Head SHA: `{data['headSha'] or 'Unavailable'}`",
             f"- Run: {data['workflowRunId']} · attempt {data['attempt']}",
             f"- Source evidence validated: {'yes' if data['evidenceValidated'] else 'no'}", '']
    if data['runUrl']:
        lines += [f"[Open workflow and original recordings]({data['runUrl']})", '']
    if data['evidence']:
        source = data['evidence']; counts = source['browserAssertions']
        lines += ['### Deterministic browser evidence', '',
                  f"Passed: {counts['passed']} · Failed: {counts['failed']} · Skipped: {counts['skipped']}",
                  f"Recordings: {source['recordings']} · Hashed artifacts: {source['artifacts']}", '']
        api = source.get('apiAssertions')
        lines += ['### Backend API evidence', '',
                  f"Passed: {api['passed']} · Failed: {api['failed']} · Skipped: {api['skipped']}" if api is not None else 'API results were not included in this capture.', '']
        from evidence_tool import markdown as escape_markdown
        lines += ["### Individual tests", ""] + [f"- {a['status'].upper()}: {escape_markdown(a['label'])}" for a in source['testResults']] + ['']
    if data['status'] == 'not_configured':
        lines += ['No agent was run. Configure the `CODEX_AUTH_JSON` GitHub secret to enable CLI review.', '']
    if data['failure']:
        lines += [f"Failure stage: `{data['failure']['stage']}` · category: `{data['failure']['category']}`", '']
    if data['review']:
        # A data-derived fence prevents model text from escaping its text block.
        fence = '`' * max(3, max((len(x) for x in re.findall('`+', data['review'])), default=0) + 1)
        lines += ['### Codex suggestions', '', fence + 'text', data['review'], fence, '']
    lines += ['### Limits', ''] + ['- ' + value for value in data['limitations']] + ['']
    return '\n'.join(lines)


def html_report(data):
    esc = lambda value: html.escape(str(value), quote=True)
    source = data['evidence']
    rows = [('Codex status', data['status']), ('Verification', 'Unverified — advisory'),
            ('Repository', data['repository']), ('Pull request', data['pullRequest']),
            ('Head SHA', data['headSha'] or 'Unavailable'), ('Workflow run / attempt', f"{data['workflowRunId']} / {data['attempt']}"),
            ('Evidence validated', data['evidenceValidated']), ('Started', data['startedAt'] or 'Not observed'), ('Finished', data['finishedAt'])]
    if source:
        rows += [('Browser assertions', ', '.join(f'{value} {key}' for key, value in source['browserAssertions'].items())),
                 ('Backend API assertions', ', '.join(f'{value} {key}' for key,value in source['apiAssertions'].items()) if source.get('apiAssertions') is not None else 'Not captured'),
                 ('Original recordings', source['recordings']), ('Hashed artifacts', source['artifacts'])]
    if data['failure']:
        rows += [('Failure stage', data['failure']['stage']), ('Failure category', data['failure']['category'])]
    advice = data['review'] or ('No agent was run. Configure CODEX_AUTH_JSON in GitHub Actions secrets.' if data['status'] == 'not_configured' else 'No completed agent review is available.')
    gaps = source['coverageGaps'] if source else ['Source evidence was not validated; no test success is claimed.']
    tests = ('<h2>Individual frontend and backend tests</h2><table>' + ''.join(f"<tr><th>{esc(a['label'])}</th><td>{esc(a['status'])}</td></tr>" for a in source.get('testResults',[])) + '</table>') if source else ''
    link = f'<p><a href="{esc(data["runUrl"])}">Open workflow and original recordings</a></p>' if data['runUrl'] else ''
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Codex CI report</title><style>body{font:16px system-ui;color:#20332b;background:#f5f6f1;max-width:900px;margin:40px auto;padding:24px}'
            'table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}'
            'pre{white-space:pre-wrap;background:white;padding:24px;border:1px solid #ddd}h1{font:40px Georgia}</style><main><h1>Codex CI report</h1>'
            '<p>Advisory review · Unverified evidence</p><table>' + ''.join(f'<tr><th>{esc(k)}</th><td>{esc(v)}</td></tr>' for k,v in rows) + '</table>'
            + link + tests + '<h2>Codex suggestions</h2><pre>' + esc(advice) + '</pre><h2>Coverage gaps</h2><ul>'
            + ''.join('<li>' + esc(gap) + '</li>' for gap in gaps) + '</ul><h2>Limits</h2><ul>'
            + ''.join('<li>' + esc(value) + '</li>' for value in data['limitations']) + '</ul></main></html>\n')


def write(data, output):
    root = Path(output).parent; root.mkdir(parents=True, exist_ok=True)
    (root / 'report.json').write_text(json.dumps(data, indent=2) + '\n')
    (root / 'report.md').write_text(markdown(data))
    (root / 'report.html').write_text(html_report(data))
    return root


def finalize():
    output = os.environ['REVIEW_OUTPUT']
    path = Path(output).parent / 'report.json'
    if path.is_file():
        data = json.loads(path.read_text())
    else:
        data = build('failed', failure={'stage': 'action setup or execution', 'category': 'review did not complete'})
    root = write(data, output)
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write(markdown(data))
    with open(os.environ['GITHUB_OUTPUT'], 'a') as outputs:
        outputs.write(f"status={data['status']}\nreport-json={root / 'report.json'}\nreport-markdown={root / 'report.md'}\nreport-html={root / 'report.html'}\n")


if __name__ == '__main__':
    finalize()
