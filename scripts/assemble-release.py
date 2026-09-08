"""Reassemble bounded uploads on GitHub when a local long TLS upload fails.

Only operates on a draft. The full image must match SHA256SUMS before upload;
temporary parts are removed only after GitHub reports that same full digest.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)

tag = os.environ['RELEASE_TAG']
assert re.fullmatch(r'v\d+\.\d+\.\d+', tag)
repository = os.environ['GH_REPO']
assert repository == 'aindaco1/auto-subtitle'
release = json.loads(gh('api', f'repos/{repository}/releases/tags/{tag}'))
assert release['draft'], 'Never mutate a published release.'
name = f'Auto-Subtitle-{tag[1:]}-arm64.dmg'
with tempfile.TemporaryDirectory(prefix='auto-subtitle-assemble-') as temporary:
    folder = Path(temporary)
    gh('release', 'download', tag, '--pattern', 'upload-part-*.bin', '--pattern', 'SHA256SUMS', '--dir', str(folder))
    parts = sorted(folder.glob('upload-part-*.bin'))
    assert parts and len(parts) <= 100
    for index, part in enumerate(parts, 1):
        assert part.name == f'upload-part-{index:03d}-of-{len(parts):03d}.bin'
        assert 0 < part.stat().st_size <= 16 * 1024 * 1024
    checksum = dict(line.split('  ', 1)[::-1] for line in (folder / 'SHA256SUMS').read_text().splitlines())[name]
    assert re.fullmatch('[a-f0-9]{64}', checksum)
    image = folder / name
    with image.open('wb') as output:
        for part in parts:
            output.write(part.read_bytes())
    with image.open('rb') as source:
        assert hashlib.file_digest(source, 'sha256').hexdigest() == checksum
    existing = next((a for a in release['assets'] if a['name'] == name), None)
    if existing:
        assert existing.get('digest') == 'sha256:' + checksum
    else:
        gh('release', 'upload', tag, str(image))
    assets = json.loads(gh('api', f'repos/{repository}/releases/{release["id"]}/assets'))
    uploaded = next(a for a in assets if a['name'] == name)
    assert uploaded['state'] == 'uploaded' and uploaded['digest'] == 'sha256:' + checksum
    for part in parts:
        gh('release', 'delete-asset', tag, part.name, '--yes')
    print(f'Verified {name}: {checksum}. Removed temporary parts; release remains draft.')
