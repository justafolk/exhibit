import io
import urllib.error
import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import provision_workspace as provision


class ProvisionTests(unittest.TestCase):
    def test_default_http_transport_decodes_json(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"status":"ready"}'
        with patch.object(provision.urllib.request, 'urlopen', return_value=response) as transport:
            self.assertEqual(provision.request('https://example.invalid/ready'), {'status': 'ready'})
            self.assertEqual(transport.call_count, 1)

    def test_provider_error_is_classified_without_echoing_secrets(self):
        error=urllib.error.HTTPError('https://api.render.com/v1/services/example',402,'Payment required',{},io.BytesIO(b'{"message":"Add billing details", "secret":"synthetic-never-print"}'))
        with patch.object(provision.urllib.request,'urlopen',side_effect=error):
            with self.assertRaises(provision.SetupError) as caught:provision.request('https://api.render.com/v1/services/example','PATCH',{})
        self.assertIn('HTTP 402',str(caught.exception))
        self.assertIn('billing or payment',str(caught.exception))
        self.assertNotIn('synthetic-never-print',str(caught.exception))

    def targets(self):
        return ({'ownerId': provision.WORKSPACE, 'repo': 'https://github.com/justafolk/exhibit',
                 'serviceDetails': {'region': 'oregon'}},
                {'owner': {'id': provision.WORKSPACE}, 'name': 'exhibit-workspace',
                 'status': 'available', 'region': 'oregon', 'ipAllowList': []})

    def test_operator_rejects_wrong_owner_source_region_or_unready_database(self):
        service, database = self.targets()
        provision.validate_targets(service, database)
        for key, value in [('region', 'singapore'), ('status', 'creating'), ('name', 'another-workspace')]:
            changed = copy.deepcopy(database)
            changed[key] = value
            with self.assertRaises(provision.SetupError):
                provision.validate_targets(service, changed)
        for key, value in [('ownerId', 'another-owner'), ('repo', 'https://github.com/other/project')]:
            changed = copy.deepcopy(service)
            changed[key] = value
            with self.assertRaises(provision.SetupError):
                provision.validate_targets(changed, database)

    def test_external_database_url_requires_tls_and_preserves_other_options(self):
        url = provision.database_url('postgres://sample:synthetic@host/db?sslmode=disable&connect_timeout=10')
        self.assertIn('sslmode=require', url)
        self.assertIn('connect_timeout=10', url)
        for invalid in ('https://host/db', 'postgres://host/db'):
            with self.assertRaises(provision.SetupError):
                provision.database_url(invalid)

    def test_operator_failure_restores_access_and_never_changes_service_mode(self):
        service, database = self.targets()
        changes = []

        def render(path, method='GET', data=None):
            if method != 'GET':
                changes.append((path, method, data))
                return {}
            if path == 'services/' + provision.SERVICE:
                return service
            if path.endswith('/connection-info'):
                return {'externalConnectionString': 'postgres://sample:synthetic@host/db',
                        'internalConnectionString': 'postgres://sample:synthetic@internal/db'}
            return database

        ip = MagicMock()
        ip.__enter__.return_value.read.return_value = b'192.0.2.40'
        environment = {'RENDER_API_KEY': 'synthetic', 'EXHIBIT_OWNER_EMAIL': 'sample@example.invalid',
                       'EXHIBIT_OWNER_NAME': 'Sample', 'EXHIBIT_WORKSPACE_NAME': 'Sample'}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, environment, clear=True), \
                patch.object(provision, 'ROOT', Path(directory)), \
                patch.object(provision, 'render', side_effect=render), \
                patch.object(provision.subprocess, 'run'), \
                patch.object(provision.urllib.request, 'urlopen', return_value=ip), \
                patch.object(provision, 'run_operator', side_effect=provision.SetupError('synthetic failure')):
            with self.assertRaises(provision.SetupError):
                provision.main()
        self.assertEqual(len(changes), 2)
        self.assertEqual(changes[0][2]['ipAllowList'][0]['cidrBlock'], '192.0.2.40/32')
        self.assertEqual(changes[-1][2], {'ipAllowList': []})
        self.assertTrue(all(path.startswith('postgres/') for path, _, _ in changes))


if __name__ == '__main__':
    unittest.main()
