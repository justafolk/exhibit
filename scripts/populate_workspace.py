#!/usr/bin/env python3
"""Explicit manual population of sample review records; no schema or account changes."""
import ipaddress
import os
import subprocess
import sys
import urllib.parse
import urllib.request

from provision_workspace import (DATABASE, SERVICE, SetupError, database_url, mask,
                                 render, run_operator, validate_targets)


def main():
    for key in ('RENDER_API_KEY', 'EXHIBIT_SAMPLE_WORKSPACE_ID', 'EXHIBIT_SAMPLE_OWNER_EMAIL'):
        if not os.environ.get(key):
            raise SetupError('Missing required environment variable: ' + key)
    database = render('postgres/' + DATABASE)
    validate_targets(render('services/' + SERVICE), database)
    external = database_url(render('postgres/' + DATABASE + '/connection-info')['externalConnectionString'])
    mask(external)
    mask(urllib.parse.urlsplit(external).password)
    original = database['ipAllowList']
    with urllib.request.urlopen('https://api.ipify.org', timeout=20) as response:
        address = ipaddress.ip_address(response.read().decode().strip())
    if address.version != 4:
        raise SetupError('Expected an IPv4 operator address.')
    render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': original + [
        {'cidrBlock': str(address) + '/32', 'description': 'Temporary workspace sample population'}]})
    try:
        run_operator(['go', 'run', './services/api/cmd/populate-workspace',
                      '--workspace-id', os.environ['EXHIBIT_SAMPLE_WORKSPACE_ID'],
                      '--owner-email', os.environ['EXHIBIT_SAMPLE_OWNER_EMAIL'],
                      '--confirm-sample-data'], dict(os.environ, DATABASE_URL=external))
        print('Illustrative sample records populated; existing records preserved.')
    finally:
        render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': original})


if __name__ == '__main__':
    try:
        main()
    except SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (subprocess.SubprocessError, KeyError, OSError, ValueError):
        print('Sample population failed; inspect completed steps before retrying.', file=sys.stderr)
        sys.exit(1)
