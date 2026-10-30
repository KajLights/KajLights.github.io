#!/usr/bin/env python3
"""Build a bounded, transactional website mirror from verified published releases."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'.deps/lightvm'
sys.path.insert(0, str(SOURCE/'shared/device-core/tools'))
from discover_releases import discover
from release_contract import packed, read_json, file_record


def sha(data):
    return hashlib.sha256(data).hexdigest()


def validate_catalogue(catalogue):
    registry = Registry()
    for name in ('build', 'firmware', 'release'):
        schema = read_json(SOURCE/'shared/device-core/contracts'/f'{name}.schema.json')
        registry = registry.with_resource(schema['$id'], Resource.from_contents(schema))
    Draft202012Validator(read_json(ROOT/'release-policy/catalogue.schema.json'), registry=registry).validate(catalogue)


def validate_policy(policy):
    if policy.get('schema') != 'kajlights.release_policy' or policy.get('format') != 1:
        raise ValueError('Unknown website policy contract')
    allowed = {'KajLights/lightvm': 'lightvm', 'KajLights/kaj-fi': 'kaj-fi'}
    if len({s['repository'] for s in policy['sources']}) != len(policy['sources']):
        raise ValueError('Duplicate release source')
    for source in policy['sources']:
        if allowed.get(source['repository']) != source['product']:
            raise ValueError('Release source/product is not registered')
        if source['repository'] == 'KajLights/kaj-fi' and source['enabled']:
            raise ValueError('Public kaj-fi distribution requires an approved public distribution contract first')
    for key in ('recommendations', 'withdrawals', 'installation_acceptances'):
        for row in policy[key]:
            if not re.fullmatch('sha256:[0-9a-f]{64}', row['build_id']):
                raise ValueError('Policy must identify a full build digest')
    for acceptance in policy['installation_acceptances']:
        if not acceptance.get('evidence', '').startswith('https://') or not acceptance.get('methods') or not set(acceptance['methods']).issubset({'usb-serial','uf2'}):
            raise ValueError('Installation acceptance needs method-specific evidence')
    if type(policy['max_distribution_bytes']) is not int or not 0 < policy['max_distribution_bytes'] <= 805306368:
        raise ValueError('Invalid distribution budget')


def build_catalogue(policy, pin, destination, acquire=discover, locked=None, now=None):
    """Only the caller publishes the staged result after every source succeeds."""
    validate_policy(policy)
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    policy_hash = sha(packed(policy).encode())
    if locked and (locked['policy_sha256'] != policy_hash or locked['implementation_revision'] != pin['revision']):
        raise ValueError('Locked import requires its exact policy and implementation revision')
    entries, release_locks, total = [], [], 0
    def copy(source, relative):
        nonlocal total
        path = destination/relative
        if path.exists():
            if sha(path.read_bytes()) != sha(source.read_bytes()):
                raise ValueError('Immutable mirror path changed')
            return
        total += source.stat().st_size
        if total > policy['max_distribution_bytes']:
            raise ValueError('Firmware history exceeds the website distribution budget')
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, path)
    for source in policy['sources']:
        if not source['enabled']:
            continue
        repository = source['repository']
        expected = [r for r in locked['releases'] if r['repository'] == repository] if locked else None
        def verified(record, directory):
            manifest = record['manifest']
            manifest_hash = sha((directory/'release.json').read_bytes())
            old = next((r for r in expected or [] if r['release_id'] == record['release_id']), None)
            if expected is not None and (not old or old['manifest_sha256'] != manifest_hash):
                raise ValueError('A locked release manifest changed')
            prefix = 'releases/'+repository.replace('/', '-')+'/'+str(record['release_id'])+'/'+manifest_hash
            for name in ('release.json', 'release.sigstore.json'):
                copy(directory/name, prefix+'/'+name)
            release_locks.append({'repository': repository, 'release_id': record['release_id'],
                'tag': manifest['tag'], 'source_revision': manifest['source_revision'],
                'manifest_sha256': manifest_hash, 'published_at': record['published_at']})
            for artifact in manifest['artifacts']:
                build_id = artifact['build']['firmware']['build_id']
                assets = {}
                for asset in artifact['assets']:
                    relative = 'assets/'+asset['sha256']+'/'+asset['name']
                    if file_record(directory/asset['name']) != asset:
                        raise ValueError('Verified source changed before mirroring')
                    copy(directory/asset['name'], relative)
                    assets[asset['name']] = 'distribution/'+relative
                withdrawal = next((r for r in policy['withdrawals'] if r['build_id'] == build_id), None)
                accepted = sorted({m for a in policy['installation_acceptances'] if a['build_id'] == build_id for m in a['methods']})
                entries.append({'id': build_id, 'repository': repository,
                    'release': {k: manifest[k] for k in ('tag','version','channel','source_revision')},
                    'release_id': record['release_id'], 'published_at': record['published_at'], 'release_url': record['url'],
                    'manifest': 'distribution/'+prefix+'/release.json', 'manifest_sha256': manifest_hash,
                    'artifact': artifact, 'assets': assets,
                    'policy': {'withdrawn': bool(withdrawal), 'reason': withdrawal.get('reason','') if withdrawal else '',
                        'recommended': any(r['build_id'] == build_id for r in policy['recommendations']) and not bool(withdrawal),
                        'accepted_methods': accepted}})
        acquire(repository, include_prereleases=True, on_verified=verified,
                release_ids=[r['release_id'] for r in expected] if expected is not None else None)
    if len({e['id'] for e in entries}) != len(entries):
        raise ValueError('Conflicting build identities across releases')
    entries.sort(key=lambda e: e['id'])
    release_locks.sort(key=lambda r: (r['repository'], r['release_id']))
    if locked and release_locks != locked['releases']:
        raise ValueError('Locked release inventory changed')
    timestamp = locked['verified_at'] if locked else now or datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    lock = {'schema': 'kajlights.import_lock', 'format': 1, 'implementation_revision': pin['revision'],
        'policy_sha256': policy_hash, 'verified_at': timestamp, 'releases': release_locks}
    lock_data = (packed(lock)+'\n').encode()
    (destination/'import-lock.json').write_bytes(lock_data)
    identity = {'implementation_revision': pin['revision'], 'policy_sha256': policy_hash, 'releases': release_locks}
    catalogue = {'schema': 'kajlights.catalogue', 'format': 1, 'id': 'sha256:'+sha(packed(identity).encode()),
        'verified_at': timestamp, 'implementation_revision': pin['revision'],
        'lock': {'path': 'distribution/import-lock.json', 'sha256': sha(lock_data)},
        'sources': policy['sources'], 'tool_contracts': policy['tool_contracts'], 'candidates': entries}
    validate_catalogue(catalogue)
    (destination/'catalogue.json').write_text(packed(catalogue)+'\n')
    return catalogue


def publish_staged(staged, public):
    public = Path(public); public.mkdir(parents=True, exist_ok=True)
    distribution = public/'distribution'
    old = public/'.distribution-previous'
    if old.exists():
        shutil.rmtree(old)
    if distribution.exists():
        distribution.rename(old)
    try:
        shutil.copytree(staged, distribution)
        (distribution/'catalogue.json').replace(public/'catalogue.json')
    except BaseException:
        shutil.rmtree(distribution, ignore_errors=True)
        if old.exists():
            old.rename(distribution)
        raise
    shutil.rmtree(old, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', type=Path, default=ROOT/'release-policy/policy.json')
    parser.add_argument('--locked', type=Path)
    parser.add_argument('--public', type=Path, default=ROOT/'public')
    args = parser.parse_args()
    pin = read_json(ROOT/'implementation.json')
    revision = subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'], text=True).strip()
    if SOURCE.is_symlink() or revision != pin['revision'] or subprocess.check_output(['git','-C',str(SOURCE),'status','--porcelain']):
        raise ValueError('Website imports require the clean pinned implementation checkout')
    (ROOT/'build').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=ROOT/'build', prefix='import-') as directory:
        catalogue = build_catalogue(read_json(args.policy), pin, directory, locked=read_json(args.locked) if args.locked else None)
        publish_staged(directory, args.public)
    print(f"Verified {len(catalogue['candidates'])} published firmware candidates; snapshot {catalogue['id']}")
if __name__ == '__main__':
    main()
