#!/usr/bin/env python3
"""Materialize one pinned public implementation dependency; never a sibling HEAD."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
def prepare(local=None):
    pin = json.loads((ROOT/'implementation.json').read_text())
    if pin['repository'] != 'KajLights/lightvm' or not re.fullmatch('[0-9a-f]{40}', pin['revision']):
        raise ValueError('Invalid implementation pin')
    destination = ROOT/'.deps/lightvm'
    destination.parent.mkdir(exist_ok=True)
    def git(*args):
        return subprocess.check_output(['git', '-C', str(destination), *args], text=True).strip()
    if local:
        if destination.exists() or destination.is_symlink():
            raise ValueError('Remove the local .deps/lightvm link before changing dependency mode')
        destination.symlink_to(local.resolve(), target_is_directory=True)
        print('Development-only source override:', local)
    else:
        if destination.is_symlink():
            raise ValueError('Production preparation refuses local source overrides')
        fresh = not destination.exists()
        if fresh:
            subprocess.run(['git', 'clone', '--filter=blob:none', '--no-checkout',
                            'https://github.com/'+pin['repository']+'.git', str(destination)], check=True)
        if not fresh and git('status', '--porcelain'):
            raise ValueError('Pinned dependency is modified')
        if fresh or git('rev-parse', 'HEAD') != pin['revision']:
            subprocess.run(['git','-C',str(destination),'fetch','--depth=1','origin',pin['revision']], check=True)
            subprocess.run(['git','-C',str(destination),'checkout','--detach',pin['revision']], check=True)
        if git('rev-parse', 'HEAD') != pin['revision']:
            raise ValueError('Implementation revision mismatch')
        if git('status', '--porcelain'):
            raise ValueError('Prepared implementation is not clean')
    licenses = ROOT/'public/notices'
    licenses.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(destination/'shared/device-core/LICENSE', licenses/'device-core.txt')
    return destination
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local', type=Path, help='Explicit development-only source checkout')
    args = parser.parse_args()
    prepare(args.local)
