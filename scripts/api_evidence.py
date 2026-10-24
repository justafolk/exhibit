"""Collect bounded Node JUnit API results with startup provenance and original bytes."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from evidence_tool import MAX_JSON_BYTES, read_json, require, timestamp


def collect_api(junit, metadata, sha, root):
    junit, metadata, root = Path(junit), Path(metadata), Path(root)
    for path in (junit, metadata):
        require(not path.is_symlink() and all(not parent.is_symlink() for parent in path.parents),
                "API evidence symlinks are not allowed")
    provenance = read_json(metadata)
    require(type(provenance.get('schemaVersion')) is int and provenance['schemaVersion'] == 1,
            "unsupported API capture version")
    require(provenance.get('headSha') == sha and provenance.get('dirty') is False,
            "API capture must start from the same clean commit")
    code = provenance.get('exitCode')
    require(type(code) is int and 0 <= code <= 255 and provenance.get('signal') is None,
            "API runner did not complete normally")
    started = timestamp(provenance.get('startedAt'), 'API start time')
    finished = timestamp(provenance.get('finishedAt'), 'API finish time')
    require(0 <= (finished-started).total_seconds() <= 3600, 'invalid API timing interval')
    with junit.open('rb') as source:
        raw = source.read(MAX_JSON_BYTES + 1)
    require(len(raw) <= MAX_JSON_BYTES and b'<!DOCTYPE' not in raw.upper() and b'<!ENTITY' not in raw.upper(),
            'API JUnit is oversized or contains unsupported declarations')
    try:
        tree = ET.fromstring(raw)
    except ET.ParseError as error:
        raise ValueError('invalid API JUnit XML') from error
    require(tree.tag in ('testsuites','testsuite'), 'unsupported API JUnit root')
    cases = list(tree.iter('testcase'))
    require(0 < len(cases) <= 450, 'API report must contain a bounded, nonempty test suite')
    assertions = []
    for index, case in enumerate(cases):
        failed = case.find('failure') is not None or case.find('error') is not None
        skipped = case.find('skipped') is not None
        name = case.get('name', '')
        require(bool(name.strip()), 'API test name is required')
        assertions.append({'id':f'api-test-{index+1}', 'label':f'API test: {name}',
                           'status':'failed' if failed else 'skipped' if skipped else 'passed'})
    require(any(a['status'] != 'skipped' for a in assertions), 'API suite did not execute any tests')
    has_failure = any(a['status'] == 'failed' for a in assertions)
    require(code != 0 or not has_failure, 'API exit status contradicts failed JUnit tests')
    if code != 0 and not has_failure:
        assertions.append({'id':'api-runner','label':'API runner completed successfully','status':'failed'})
    directory = root / 'api'
    require(not root.is_symlink() and not directory.is_symlink(), 'API artifact directory cannot be a symlink')
    directory.mkdir(parents=True, exist_ok=True)
    artifacts = []
    # Store the bytes actually parsed/validated, rather than rereading mutable files.
    for name, content, media in [('api-tests.xml',raw,'text/plain'),
                                 ('api-capture.json',(json.dumps(provenance,indent=2)+'\n').encode(),'application/json')]:
        path = directory / name
        require(not path.is_symlink(), 'API artifact cannot be a symlink')
        path.write_bytes(content)
        artifacts.append({'path':f'api/{name}','bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'mediaType':media})
    return assertions, artifacts, provenance
