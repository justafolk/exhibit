#!/usr/bin/env python3
"""Deploy the existing workspace without provisioning or changing user accounts."""
import ipaddress
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from provision_workspace import (DATABASE, ORIGIN, SERVICE, SetupError, database_url,
                                 mask, render, request, run_operator, validate_targets)

MOUNT = '/var/lib/exhibit/artifacts'


def disk_for_service():
    disks = render('disks?serviceId=' + SERVICE + '&limit=100')
    disks = [item.get('disk', item) for item in disks]
    disks = [item for item in disks if item.get('serviceId') == SERVICE]
    if len(disks) > 1 or (disks and disks[0]['mountPath'] != MOUNT):
        raise SetupError('Existing disk layout differs; no existing disk will be changed or deleted.')
    return disks[0] if disks else None


def migrate(database):
    external = database_url(render('postgres/' + DATABASE + '/connection-info')['externalConnectionString'])
    mask(external)
    mask(urllib.parse.urlsplit(external).password)
    original = database['ipAllowList']
    with urllib.request.urlopen('https://api.ipify.org', timeout=20) as response:
        address = ipaddress.ip_address(response.read().decode().strip())
    if address.version != 4:
        raise SetupError('Expected an IPv4 operator address.')
    render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': original + [
        {'cidrBlock': str(address) + '/32', 'description': 'Temporary Exhibit deployment migration'}]})
    try:
        run_operator(['go', 'run', './services/api/cmd/migrate'], dict(os.environ, DATABASE_URL=external))
    finally:
        render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': original})
    print('Additive migrations applied; database access restored. Existing accounts preserved.', flush=True)


def verify(commit):
    ready = request(ORIGIN + '/api/readyz')
    version = request(ORIGIN + '/api/version')
    if ready != {'status': 'ready', 'mode': 'postgres'} or version.get('commitSha') != commit:
        raise SetupError('Live database readiness or deployed commit did not match.')
    # This route responds 503 if storage is unconfigured, 404 on the old revision,
    # and 401 when the new private ingestion service is ready for a bearer token.
    probe = urllib.request.Request(ORIGIN + '/api/ingest/v1/runs', data=b'{}',
                                   headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(probe, timeout=30)
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise SetupError('Private ingestion route did not enforce its expected authentication boundary.') from None
    else:
        raise SetupError('Private ingestion route accepted an unauthenticated upload.')


def main():
    if not os.environ.get('RENDER_API_KEY'):
        raise SetupError('Missing RENDER_API_KEY repository Actions secret.')
    commit = os.environ.get('GITHUB_SHA', '')
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise SetupError('Expected the immutable trusted main commit in GITHUB_SHA.')
    local = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if local != commit:
        raise SetupError('Checked-out operator code does not match the requested deployment commit.')
    service = render('services/' + SERVICE)
    database = render('postgres/' + DATABASE)
    validate_targets(service, database)
    disk = disk_for_service()
    print('Validated existing service/database. Current plan: ' + service['serviceDetails']['plan'], flush=True)
    if service['serviceDetails']['plan'] == 'free':
        raise SetupError('Switch exhibit-sample from Free to Starter in the Render dashboard first; Render API cannot change between free and paid plans. No deployment changes were made.')
    migrate(database)
    changes = {'branch': 'main', 'autoDeployTrigger': 'off'}
    render('services/' + SERVICE, 'PATCH', changes)
    if not disk:
        disk = render('disks', 'POST', {'name': 'exhibit-artifacts', 'serviceId': SERVICE,
                                       'mountPath': MOUNT, 'sizeGB': 10})
        print('Created the merged 10 GB private persistent artifact disk.', flush=True)
    else:
        print('Reusing the existing private artifact disk.', flush=True)
    for key, value in {'EXHIBIT_STORE': 'postgres', 'EXHIBIT_ARTIFACT_DIR': MOUNT,
                       'EXHIBIT_COOKIE_SECURE': 'true', 'EXHIBIT_PUBLIC_ORIGIN': ORIGIN,
                       'COMMIT_SHA': commit}.items():
        render('services/' + SERVICE + '/env-vars/' + key, 'PUT', {'value': value})
    deployment = render('services/' + SERVICE + '/deploys', 'POST', {'commitId': commit})
    ident = deployment['id']
    print('Deploying ' + commit + '; Render deployment ' + ident, flush=True)
    deadline = time.monotonic() + 1200
    previous = None
    while time.monotonic() < deadline:
        status = render('services/' + SERVICE + '/deploys/' + ident)['status']
        if status != previous:
            print('Render status: ' + status, flush=True)
            previous = status
        if status == 'live':
            verify(commit)
            print('Live commit, PostgreSQL readiness, artifact storage and private ingestion verified: ' + ORIGIN, flush=True)
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(
                    f'Deployed `{commit}` to {ORIGIN}. Render deployment `{ident}`.\n\n'
                    'PostgreSQL migrations applied, persistent artifact disk attached, existing accounts preserved, '
                    'readiness/commit/private ingestion verified.\n')
            return
        if status in ('build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'):
            raise SetupError('Render deployment ended with ' + status)
        time.sleep(10)
    raise SetupError('Render deployment did not reach live before the deadline.')


if __name__ == '__main__':
    try:
        main()
    except SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (subprocess.SubprocessError, KeyError, OSError, ValueError):
        print('Workspace deployment failed; credential-bearing responses were suppressed.', file=sys.stderr)
        sys.exit(1)
