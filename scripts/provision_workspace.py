#!/usr/bin/env python3
"""Manual operator setup for the explicitly selected Exhibit pilot resources.

Only run from a trusted default-branch workflow. Secrets are environment inputs;
no credentials are written to source, logs, artifacts, or the job summary.
"""
import http.cookiejar
import ipaddress
import json
import os
import re
import secrets
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WORKSPACE = 'tea-dbe56rl9fdbs739c0vrg'
SERVICE = 'srv-dbe596bncjis73e739bg'
DATABASE = 'dpg-dbe8gfa9lscs73a9h5a0-a'
ORIGIN = 'https://exhibit-sample.onrender.com'
SAMPLE_SHA = '3efafe232f3eaad3959d94e625b9edbab9f86ed4'
ROOT = Path(__file__).resolve().parent.parent


class SetupError(Exception):
    pass


def mask(value):
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        escaped = value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::add-mask::' + escaped, flush=True)


def request(url, method='GET', data=None, headers=None, opener=None):
    raw = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=raw, method=method,
                                 headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with (opener.open if opener else urllib.request.urlopen)(req, timeout=45) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        # Classify fixed operational causes; never echo provider response text,
        # which can include credentials or connection strings.
        raw_detail = error.read(8192).decode('utf-8', errors='replace')
        detail = raw_detail.lower()
        category = 'request rejected'
        for words, label in (
                (('payment', 'billing', 'credit card', 'creditcard'), 'billing or payment setup required'),
                (('insufficient', 'permission', 'unauthorized', 'forbidden'), 'insufficient permissions'),
                (('autodeploytrigger', 'auto deploy', 'autodeploy'), 'autodeploy configuration rejected'),
                (('plan', 'instance type'), 'service plan configuration rejected'),
                (('disk', 'mount'), 'persistent disk configuration rejected'),
                (('branch', 'commit'), 'source revision rejected')):
            if any(word in detail for word in words):
                category = label
                break
        # Service-update validation messages contain no submitted credentials.
        # Surface only the parsed message, with secrets/URLs stripped; never a body.
        explanation = ''
        if method == 'PATCH' and urllib.parse.urlsplit(url).path.startswith('/v1/services/'):
            try:
                message = json.loads(raw_detail).get('message', '')
                if isinstance(message, str):
                    for key, value in os.environ.items():
                        if value and len(value)>5 and any(word in key for word in ('KEY','TOKEN','SECRET','PASSWORD','DATABASE_URL')):
                            message = message.replace(value, '[redacted]')
                    message = re.sub(r'(?:https?|postgres(?:ql)?):\S+', '[url]', message)
                    message = re.sub(r'(?i)bearer\s+\S+', 'Bearer [redacted]', message)
                    explanation = ': ' + ' '.join(message.split())[:400]
            except (ValueError, AttributeError):
                pass
        raise SetupError('Request failed: ' + method + ' ' + urllib.parse.urlsplit(url).path
                         + f' (HTTP {error.code}: {category})' + explanation) from None
    except (urllib.error.URLError, ValueError):
        raise SetupError('Request failed: ' + method + ' ' + urllib.parse.urlsplit(url).path) from None


def render(path, method='GET', data=None):
    return request('https://api.render.com/v1/' + path, method, data,
                   {'Authorization': 'Bearer ' + os.environ['RENDER_API_KEY']})


def validate_targets(service, database):
    if (service['ownerId'] != WORKSPACE or database['owner']['id'] != WORKSPACE
            or service['repo'].removesuffix('.git') != 'https://github.com/justafolk/exhibit'
            or database['name'] != 'exhibit-workspace' or database['status'] != 'available'
            or service['serviceDetails']['region'] != database['region']):
        raise SetupError('Resource ownership, source, database identity or region did not match.')


def database_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.password:
        raise SetupError('Expected a credential-bearing Postgres connection URL.')
    query = dict(urllib.parse.parse_qsl(parsed.query))
    query['sslmode'] = 'require'
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def run_operator(command, environment, stdin=None):
    result = subprocess.run(command, cwd=ROOT, env=environment, input=stdin,
                            text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise SetupError('Operator command failed; output suppressed to protect credentials: ' + command[-1])


def deploy():
    deployment = render('services/' + SERVICE + '/deploys', 'POST', {})
    ident = deployment['id']
    print('Monitoring Render deployment ' + ident, flush=True)
    deadline = time.monotonic() + 1000
    while time.monotonic() < deadline:
        status = render('services/' + SERVICE + '/deploys/' + ident)['status']
        if status == 'live':
            return ident
        if status in ('build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'):
            raise SetupError('Render deployment ended with ' + status)
        time.sleep(10)
    raise SetupError('Render deployment did not reach live before the deadline.')


def configure_workspace(email, password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    session = request(ORIGIN + '/api/v1/auth/login', 'POST',
                      {'email': email, 'password': password}, {'Origin': ORIGIN}, opener)
    if session['mode'] != 'postgres' or session['workspace']['role'] != 'owner':
        raise SetupError('Expected a persistent owner session.')
    headers = {'Origin': ORIGIN, 'X-CSRF-Token': session['csrfToken']}
    try:
        setup = dict(repository='justafolk/sample-project-exhibit',
                     stagingUrl='https://sample-project-exhibit.onrender.com',
                     testTenant='sample-project-only',
                     runbookRef='exhibit/runbook.yaml@' + SAMPLE_SHA)
        request(ORIGIN + '/api/v1/setup', 'PUT', setup, headers, opener)
        if request(ORIGIN + '/api/v1/setup', opener=opener) != setup:
            raise SetupError('Saved repository setup did not survive a read.')
        request(ORIGIN + '/api/v1/flows', 'POST', {
            'name': 'Field Store saved-address checkout',
            'description': 'Sample preparation only. Runbook is example-not-approved; no hosted execution is authorized.',
            'preconditions': ['Use a local synthetic sample server with no secrets.',
                              'Seed a unique run ID with POST /api/seed?runId=RUN_ID.'],
            'assertions': ['Saved-home address is selected.', 'Order total is 2400 cents and matches the API response.',
                           'Confirmation contains the API-created order ID.',
                           'Declined payment and out-of-stock scenarios create no order.'],
            'cleanup': 'DELETE /api/run?runId=RUN_ID; remove only the selected synthetic run.',
            'runbookRef': setup['runbookRef'],
        }, headers, opener)
        if not request(ORIGIN + '/api/v1/flows', opener=opener)['flows']:
            raise SetupError('Saved sample flow was not returned.')
    finally:
        request(ORIGIN + '/api/v1/auth/logout', 'POST', {}, headers, opener)


def main():
    for key in ('RENDER_API_KEY', 'EXHIBIT_OWNER_EMAIL',
                'EXHIBIT_OWNER_NAME', 'EXHIBIT_WORKSPACE_NAME'):
        if not os.environ.get(key):
            raise SetupError('Missing required environment variable: ' + key)
    password = secrets.token_urlsafe(32)
    if not 12 <= len(password.encode()) <= 256:
        raise SetupError('Owner password must contain 12–256 bytes.')
    mask(password)
    encrypted = ROOT / '.local/operator-credentials/owner-password.enc'
    encrypted.parent.mkdir(parents=True, exist_ok=True)
    # Only encrypted bytes leave this job; the private key stays with the operator.
    subprocess.run(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey',
                    str(ROOT / 'infra/operator-bootstrap.pub'), '-pkeyopt',
                    'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256',
                    '-out', str(encrypted)], input=password.encode(), check=True,
                   capture_output=True)
    service = render('services/' + SERVICE)
    database = render('postgres/' + DATABASE)
    validate_targets(service, database)
    connection = render('postgres/' + DATABASE + '/connection-info')
    external = database_url(connection['externalConnectionString'])
    internal = connection['internalConnectionString']
    for value in (external, internal, urllib.parse.urlsplit(external).password):
        mask(value)
    current_rules = database['ipAllowList']
    # Restrict temporary access to this operator runner; restore original rules even on failure.
    with urllib.request.urlopen('https://api.ipify.org', timeout=20) as response:
        address = ipaddress.ip_address(response.read().decode().strip())
        if address.version != 4:
            raise SetupError('Expected an IPv4 runner address for the temporary /32 rule.')
        runner_ip = str(address)
    temporary = current_rules + [{'cidrBlock': runner_ip + '/32', 'description': 'Temporary Exhibit account setup'}]
    render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': temporary})
    try:
        environment = dict(os.environ, DATABASE_URL=external)
        run_operator(['go', 'run', './services/api/cmd/migrate'], environment)
        run_operator(['go', 'run', './services/api/cmd/bootstrap-user',
                      '--email', os.environ['EXHIBIT_OWNER_EMAIL'],
                      '--name', os.environ['EXHIBIT_OWNER_NAME'],
                      '--workspace', os.environ['EXHIBIT_WORKSPACE_NAME'], '--password-stdin'],
                     environment, password + '\n')
        print('Schema applied and private owner provisioned.', flush=True)
    finally:
        render('postgres/' + DATABASE, 'PATCH', {'ipAllowList': current_rules})
    # Update only these keys; preserve all other service environment variables.
    for key, value in {'DATABASE_URL': internal, 'EXHIBIT_STORE': 'postgres',
                       'EXHIBIT_COOKIE_SECURE': 'true', 'EXHIBIT_PUBLIC_ORIGIN': ORIGIN}.items():
        render('services/' + SERVICE + '/env-vars/' + key, 'PUT', {'value': value})
    ident = deploy()
    if request(ORIGIN + '/api/readyz')['status'] != 'ready':
        raise SetupError('Deployed app is not ready.')
    configure_workspace(os.environ['EXHIBIT_OWNER_EMAIL'], password)
    print('Password login, persistent sample setup, saved flow and logout passed. Deploy: ' + ident)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(
            'Private workspace provisioned and tested. Sample repository setup and flow saved. '
            'No customer PR execution or GitHub artifact ingestion was enabled.\n')


if __name__ == '__main__':
    try:
        main()
    except SetupError as error:
        print(str(error), file=sys.stderr)
        print('Workspace setup failed. Check completed steps before retrying; an existing owner is never overwritten.', file=sys.stderr)
        sys.exit(1)
    except (subprocess.SubprocessError, KeyError, OSError, ValueError):
        print('Workspace setup failed before validation completed; inspect completed steps before retrying.', file=sys.stderr)
        sys.exit(1)
