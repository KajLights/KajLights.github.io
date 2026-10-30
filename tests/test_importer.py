"""Mirror policy/transaction tests; provenance and payload admission live upstream."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('importer',ROOT/'scripts/import-releases.py')
importer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.policy=json.loads((ROOT/'release-policy/policy.json').read_text())
        self.pin=json.loads((ROOT/'implementation.json').read_text())
        self.artifact=json.loads((ROOT/'.deps/lightvm/shared/device-core/contracts/candidate-cases.json').read_text())['artifact']
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.source=self.root/'source';self.source.mkdir()
        for asset in self.artifact['assets']:
            (self.source/asset['name']).write_text('software test fixture: '+asset['name'])
            asset.update(importer.file_record(self.source/asset['name']))
        self.artifact['build']['firmware']['release_tag']='v0.1.0'
        self.manifest={'tag':'v0.1.0','version':'0.1.0','channel':'stable','source_revision':'a'*40,'artifacts':[self.artifact]}
        (self.source/'release.json').write_text(json.dumps(self.manifest))
        (self.source/'release.sigstore.json').write_text('test-only verified-source boundary')
        self.record={'manifest':self.manifest,'release_id':7,'published_at':'2026-10-30T12:00:00Z','url':'https://github.com/KajLights/lightvm/releases/tag/v0.1.0'}
        self.calls=[]
    def acquire(self,repository,include_prereleases,on_verified,release_ids):
        self.calls.append((repository,include_prereleases,release_ids))
        on_verified(self.record,self.source)
    def build(self,**kwargs):
        return importer.build_catalogue(self.policy,self.pin,self.root/'staged',acquire=self.acquire,now='2026-10-30T12:00:00Z',**kwargs)
    def test_mirrors_only_verified_source_bytes_with_hash_addressing_and_lock(self):
        catalogue=self.build();entry=catalogue['candidates'][0]
        self.assertEqual(len(self.calls),1);self.assertEqual(self.calls[0],('KajLights/lightvm',True,None))
        self.assertEqual(entry['policy']['accepted_methods'],[])
        for asset in self.artifact['assets']:
            relative=entry['assets'][asset['name']].removeprefix('distribution/')
            self.assertEqual(importer.file_record(self.root/'staged'/relative),asset)
        lock=json.loads((self.root/'staged/import-lock.json').read_text());self.assertEqual(lock['releases'][0]['release_id'],7)
        again=importer.build_catalogue(self.policy,self.pin,self.root/'locked',acquire=self.acquire,locked=lock)
        self.assertEqual(catalogue,again);self.assertEqual(self.calls[-1][2],[7])
    def test_recommendation_withdrawal_and_method_specific_acceptance(self):
        build_id=self.artifact['build']['firmware']['build_id']
        self.policy['recommendations']=[{'build_id':build_id}]
        self.policy['withdrawals']=[{'build_id':build_id,'reason':'test withdrawal'}]
        self.policy['installation_acceptances']=[{'build_id':build_id,'methods':['usb-serial'],'evidence':'https://example.test/physical-evidence'}]
        policy=self.build()['candidates'][0]['policy']
        self.assertFalse(policy['recommended']);self.assertTrue(policy['withdrawn']);self.assertEqual(policy['accepted_methods'],['usb-serial'])
    def test_empty_public_history_is_valid_and_does_not_access_private_source(self):
        calls=[]
        catalogue=importer.build_catalogue(self.policy,self.pin,self.root/'empty',acquire=lambda *args,**kwargs:calls.append(args[0]))
        self.assertEqual(catalogue['candidates'],[]);self.assertEqual(calls,['KajLights/lightvm'])
    def test_private_source_duplicate_sources_and_invalid_policy_are_rejected(self):
        cases=[]
        p=copy.deepcopy(self.policy);p['sources'][1]['enabled']=True;cases.append(p)
        p=copy.deepcopy(self.policy);p['sources'].append(p['sources'][0]);cases.append(p)
        p=copy.deepcopy(self.policy);p['installation_acceptances']=[{'build_id':'sha256:'+'f'*64,'methods':['http-push'],'evidence':'https://e.test'}];cases.append(p)
        for policy in cases:
            with self.assertRaises(ValueError):importer.build_catalogue(policy,self.pin,self.root/'bad',acquire=self.acquire)
        self.assertEqual(self.calls,[])
    def test_budget_and_changed_verified_bytes_abort_before_publication(self):
        self.policy['max_distribution_bytes']=1
        with self.assertRaisesRegex(ValueError,'budget'):self.build()
        self.policy['max_distribution_bytes']=805306368
        (self.source/self.artifact['assets'][0]['name']).write_text('changed')
        with self.assertRaisesRegex(ValueError,'changed'):self.build()
    def test_locked_import_rejects_changed_policy_or_manifest(self):
        self.build();lock=json.loads((self.root/'staged/import-lock.json').read_text())
        self.policy['tool_contracts']=['changed']
        with self.assertRaisesRegex(ValueError,'exact policy'):self.build(locked=lock)
        self.policy['tool_contracts']=[];(self.source/'release.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'manifest changed'):self.build(locked=lock)
    def test_failed_acquisition_does_not_replace_previous_site(self):
        public=self.root/'public';(public/'distribution').mkdir(parents=True);(public/'distribution/old').write_text('previous assets');(public/'catalogue.json').write_text('previous catalogue')
        def failed(*args,**kwargs):self.acquire(*args,**kwargs);raise ValueError('signature failure in later release')
        with self.assertRaises(ValueError):importer.build_catalogue(self.policy,self.pin,self.root/'new',acquire=failed)
        self.assertEqual((public/'catalogue.json').read_text(),'previous catalogue');self.assertTrue((public/'distribution/old').exists())
        staged=self.root/'complete';staged.mkdir();(staged/'catalogue.json').write_text('new')
        with patch.object(importer.shutil,'copytree',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):importer.publish_staged(staged,public)
        self.assertTrue((public/'distribution/old').exists());self.assertEqual((public/'catalogue.json').read_text(),'previous catalogue')

if __name__=='__main__':unittest.main()
