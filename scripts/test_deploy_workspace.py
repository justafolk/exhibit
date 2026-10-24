import copy
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import deploy_workspace as deploy
from provision_workspace import SetupError


class DeploymentTests(unittest.TestCase):
    def test_migration_failure_restores_existing_database_access(self):
        changes=[]
        original=[{'cidrBlock':'192.0.2.1/32','description':'Existing operator'}]
        def render(path,method='GET',data=None):
            if method!='GET':changes.append(data);return {}
            return {'externalConnectionString':'postgres://test:synthetic@host/db'}
        response=MagicMock();response.__enter__.return_value.read.return_value=b'192.0.2.8'
        with patch.object(deploy,'render',side_effect=render),patch.object(deploy.urllib.request,'urlopen',return_value=response),patch.object(deploy,'run_operator',side_effect=SetupError('test failure')):
            with self.assertRaises(SetupError):deploy.migrate({'ipAllowList':original})
        self.assertEqual(changes[-1],{'ipAllowList':original})
        self.assertEqual(len(changes[0]['ipAllowList']),2)

    def test_existing_disk_is_preserved_and_other_layout_is_rejected(self):
        disk={'disk':{'id':'existing','serviceId':deploy.SERVICE,'mountPath':deploy.MOUNT,'sizeGB':10}}
        with patch.object(deploy,'render',return_value=[disk]):self.assertEqual(deploy.disk_for_service()['id'],'existing')
        changed=copy.deepcopy(disk);changed['disk']['mountPath']='/other-data'
        with patch.object(deploy,'render',return_value=[changed]),self.assertRaises(SetupError):deploy.disk_for_service()

    def test_free_plan_fails_before_database_or_service_mutation(self):
        service={'serviceDetails':{'plan':'free'}}
        with patch.dict(os.environ,{'RENDER_API_KEY':'synthetic','GITHUB_SHA':'a'*40}),patch.object(deploy.subprocess,'check_output',return_value='a'*40),patch.object(deploy,'render',side_effect=[service,{}]) as api,patch.object(deploy,'validate_targets'),patch.object(deploy,'disk_for_service',return_value=None),patch.object(deploy,'migrate') as migrate:
            with self.assertRaisesRegex(SetupError,'Render dashboard first'):deploy.main()
        migrate.assert_not_called()
        self.assertTrue(all(len(call.args)==1 for call in api.call_args_list))

    def test_deploy_preserves_account_and_database_settings_and_pins_commit(self):
        commit='a'*40;mutations=[]
        service={'ownerId':deploy.validate_targets.__globals__['WORKSPACE'],'repo':'https://github.com/justafolk/exhibit','serviceDetails':{'region':'oregon','plan':'starter'}}
        database={'owner':{'id':service['ownerId']},'name':'exhibit-workspace','status':'available','region':'oregon'}
        def render(path,method='GET',data=None):
            if method!='GET':mutations.append((path,data));return {'id':'dep-example'}
            if path=='services/'+deploy.SERVICE:return service
            if path=='postgres/'+deploy.DATABASE:return database
            if path.startswith('disks?'):return [{'disk':{'serviceId':deploy.SERVICE,'mountPath':deploy.MOUNT,'id':'existing'}}]
            if '/deploys/' in path:return {'status':'live'}
            self.fail(path)
        with patch.dict(os.environ,{'RENDER_API_KEY':'synthetic','GITHUB_SHA':commit}),patch.object(deploy.subprocess,'check_output',return_value=commit+'\n'),patch.object(deploy,'render',side_effect=render),patch.object(deploy,'migrate') as migrate,patch.object(deploy,'verify') as verify:
            deploy.main()
        migrate.assert_called_once_with(database);verify.assert_called_once_with(commit)
        self.assertIn(('services/'+deploy.SERVICE+'/deploys',{'commitId':commit}),mutations)
        self.assertFalse(any('DATABASE_URL' in path or path=='disks' for path,_ in mutations))
        self.assertNotIn('serviceDetails',mutations[0][1])

if __name__=='__main__':unittest.main()
