#!/usr/bin/env python3
"""Automatically record Exhibit's secret-free browser self-test for a coding agent.

No customer staging execution, uploads, or trusted verdicts. Run reviewed tests
from a clean checkout; artifacts remain local and unverified.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4


ROOT = Path(__file__).resolve().parent.parent


def repository_name(remote):
    match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?", remote.strip())
    if not match:
        raise ValueError("Use a GitHub origin without embedded credentials for capture provenance.")
    return match.group(1)


def record(root, grep=None):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
    sha = git('rev-parse', 'HEAD')
    if git('status', '--porcelain'):
        raise ValueError('Commit your changes before recording. A dirty checkout cannot produce commit-linked evidence.')
    repository = repository_name(git('remote', 'get-url', 'origin'))
    run_id = 'self-test-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
    bundle = root / '.local' / 'agent-captures' / run_id
    bundle.mkdir(parents=True)
    artifacts = bundle / 'artifacts'
    report = bundle / 'report.md'
    manifest = bundle / 'manifest.json'
    env = dict(os.environ, EXHIBIT_CAPTURE='1', PLAYWRIGHT_JSON_OUTPUT_FILE=str(bundle / 'playwright.json'))
    args = ['npm', 'run', 'test:e2e', '--', '--reporter=json', '--output', str(artifacts)]
    if grep is not None:
        args += ['--grep=' + grep]
    print('Recording Exhibit sample browser checks. No customer code or staging credentials are used.', file=sys.stderr)
    try:
        browser = subprocess.run(args, cwd=root, env=env, stdout=sys.stderr, stderr=sys.stderr, timeout=3600, check=False)
        browser_code = browser.returncode
    except subprocess.TimeoutExpired:
        browser_code = 124
        print('Browser suite timed out. Attempting to collect available output.', file=sys.stderr)
    args = [sys.executable, str(root / 'scripts' / 'evidence_capture.py'),
            '--playwright-json', str(bundle / 'playwright.json'), '--artifact-root', str(artifacts),
            '--output', str(manifest), '--repository', repository, '--sha', sha, '--run-id', run_id]
    with report.open('w') as output:
        collection = subprocess.run(args, cwd=root, stdout=output, stderr=sys.stderr, check=False)
    result = {'schemaVersion': 1, 'sample': True, 'verification': 'unverified',
              'headSha': sha, 'runId': run_id, 'bundle': str(bundle),
              'browserExitCode': browser_code, 'collectionExitCode': collection.returncode,
              'uploaded': False}
    if collection.returncode == 0:
        result.update(manifest=str(manifest), report=str(report), artifacts=str(artifacts))
    else:
        result['error'] = 'Collection failed; no valid evidence bundle is claimed. Inspect browser output and collector errors.'
    return result, 0 if browser_code == 0 and collection.returncode == 0 else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grep', help='Optional Playwright test-title filter within this repository’s sample suite.')
    args = parser.parse_args()
    try:
        result, code = record(ROOT, args.grep)
        print(json.dumps(result, indent=2))
        return code
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Automatic recording failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
