"""Prepare isolated runtime inputs from pinned, already obtained vendor distributions."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('media_runtime', type=Path, help='Verified Podcast Visualizer macos-arm64 runtime')
parser.add_argument('python_distribution', type=Path, help='uv python-build-standalone CPython 3.11.15, build 20260602')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = root/'runtime/macos-arm64'
source = args.media_runtime.resolve()
python_source = args.python_distribution.resolve()

def check(file, entry):
    if file.is_symlink() or not file.is_file() or file.stat().st_size != entry['bytes']:
        raise RuntimeError(f'Missing or incompatible runtime file: {entry["path"]}')
    with file.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != entry['sha256']:
            raise RuntimeError(f'Runtime checksum mismatch: {entry["path"]}')

# The app's checked-in manifests are the authority, not a supplied manifest.
inventories = [json.loads((root/'resources/runtime-sources'/name).read_text()) for name in ('node-manifest.json','manifest.json')]
for inventory in inventories:
    for entry in inventory['files']:
        check(source/entry['path'], entry)
version = subprocess.check_output([str(python_source/'bin/python3.11'),'-I','-c','import platform;print(platform.python_version())'],text=True).strip()
if version != '3.11.15' or '20260602' not in (python_source/'BUILD').read_text():
    raise RuntimeError('Use the pinned Python 3.11.15 standalone build 20260602.')
destination.mkdir(parents=True, exist_ok=True)
for inventory in inventories:
    for entry in inventory['files']:
        target = destination/entry['path']
        if target.exists(): check(target, entry)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source/entry['path'], target)
for name in ('node-manifest.json','manifest.json'):
    shutil.copy2(root/'resources/runtime-sources'/name,destination/name)
shutil.copy2(source/'COPYING.LGPLv2.1', destination/'COPYING.LGPLv2.1')
python_target = destination/'python'
if not python_target.exists():
    shutil.copytree(python_source,python_target,symlinks=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
subprocess.run(['uv','pip','install','--python',str(python_target/'bin/python3.11'),'--break-system-packages','--no-deps','-r',str(root/'requirements-sync.lock')],check=True)
for metadata in python_target.glob('lib/python3.11/site-packages/pip-*.dist-info/direct_url.json'):
    metadata.unlink()  # Standalone builder's temporary build path is not useful in the app.
subprocess.run([sys.executable,str(root/'scripts/relocate-python.py'),str(python_target)],check=True)
print('Verified runtime prepared. Run bash scripts/build-app.sh next.')
