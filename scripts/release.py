#!/usr/bin/env python3
"""Local Developer ID release gates. Credentials are read from files, never logged."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
IDENTITY = os.environ.get('AUTO_SUBTITLE_SIGNING_IDENTITY', 'Developer ID Application: Volver Health LLC (PWT3Q52LZ2)')
AUTH = Path(os.environ.get('AUTO_SUBTITLE_APPLE_AUTH', str(ROOT.parent / 'Apple Auth')))
DIST = ROOT / 'dist'
TEAM = 'PWT3Q52LZ2'

def run(*args, capture=False, cwd=None):
    return subprocess.run([str(a) for a in args], check=True, text=True,
                          cwd=cwd, stdout=subprocess.PIPE if capture else None).stdout

def info(app):
    return plistlib.loads((app / 'Contents/Info.plist').read_bytes())

def check_version(app):
    data = info(app)
    version = json.loads((ROOT / 'package.json').read_text())['version']
    assert data['CFBundleIdentifier'] == 'com.dustwave.autosubtitle'
    assert data['CFBundleShortVersionString'] == version
    assert re.fullmatch(r'\d+\.\d+\.\d+', version)
    assert data['SUPublicEDKey'] == (ROOT / 'resources/sparkle-public-key.txt').read_text().strip()
    assert data['SUFeedURL'] == 'https://github.com/aindaco1/auto-subtitle/releases/latest/download/appcast.xml'
    assert data['SUAutomaticallyUpdate'] is False and data['SUEnableSystemProfiling'] is False
    return version

def macho(file):
    if file.is_symlink() or not file.is_file():
        return False
    with file.open('rb') as stream:
        return stream.read(4) in (b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca')

def sign(app):
    check_version(app)
    assert app.is_absolute() and app.is_dir() and not app.is_symlink()
    run('xattr', '-cr', app)
    flags = ['--force', '--options', 'runtime', '--timestamp', '--sign', IDENTITY]
    runtime = app / 'Contents/Resources/engine-root/runtime/macos-arm64'
    code = [p for p in runtime.rglob('*') if macho(p)]
    assert len(code) > 20
    for file in code:
        assert 'arm64' in run('lipo', '-archs', file, capture=True)
        entitlements = ['--entitlements', ROOT / 'resources/Node.entitlements'] if file == runtime / 'bin/node' else []
        run('codesign', *flags, *entitlements, file)
    sparkle = app / 'Contents/Frameworks/Sparkle.framework'
    current = sparkle / 'Versions/Current'
    for child in ['XPCServices/Installer.xpc', 'XPCServices/Downloader.xpc', 'Autoupdate', 'Updater.app']:
        preserve = ['--preserve-metadata=entitlements'] if 'Downloader' in child else []
        run('codesign', *flags, *preserve, current / child)
    run('codesign', *flags, sparkle)
    run('codesign', *flags, app)
    run('codesign', '--verify', '--deep', '--strict', app)
    run('python3', ROOT / 'scripts/verify-bundle.py', app)
    run(runtime / 'bin/node', '-e', 'for(let i=0;i<100000;i++){Math.sqrt(i)}; console.log("Signed Node JIT passed")')

def notarize(artifact, label):
    DIST.mkdir(exist_ok=True)
    if os.environ.get('AUTO_SUBTITLE_NOTARY_TRANSPORT', 'api') == 'api':
        run('uv', 'run', '--locked', '--script', ROOT / 'scripts/notarize-api.py', artifact,
            DIST / f'NOTARIZATION-{label}.json')
        return
    with tempfile.TemporaryDirectory(prefix='auto-subtitle-notary-', dir='/private/tmp') as temporary:
        folder = Path(temporary)
        candidates = list(AUTH.glob('AuthKey_*.p8'))
        assert len(candidates) == 1, 'Choose an unambiguous Apple API key in Apple Auth.'
        key = folder / candidates[0].name
        shutil.copyfile(candidates[0], key)
        key.chmod(0o600)
        issuer = (AUTH / 'apple-api-issuer.txt').read_text().strip()
        credentials = ['--key', key.name, '--key-id', key.stem.removeprefix('AuthKey_'), '--issuer', issuer]
        # notarytool can crash with a synced checkout as its working directory.
        # Match CutNotes: local working directory and local relative input/key paths.
        shutil.copyfile(artifact, folder / artifact.name)
        result = json.loads(run('xcrun', 'notarytool', 'submit', artifact.name, '--no-wait', '--no-progress', '--s3-acceleration', '--output-format', 'json', *credentials, capture=True, cwd=folder))
        identifier = result['id']
        print(f'{label} notarization submitted: {identifier}', flush=True)
        for _ in range(180):
            status = json.loads(run('xcrun', 'notarytool', 'info', identifier, '--output-format', 'json', *credentials, capture=True, cwd=folder))
            if status['status'] == 'Accepted':
                (DIST / f'NOTARIZATION-{label}.json').write_text(json.dumps(status, indent=2) + '\n')
                print(f'{label} notarization accepted', flush=True)
                return
            if status['status'] != 'In Progress':
                log = run('xcrun', 'notarytool', 'log', identifier, *credentials, capture=True, cwd=folder)
                (ROOT / 'artifacts/releases' / f'notarization-{label}-failure.json').write_text(log)
                raise RuntimeError(f'{label} notarization failed; see private release evidence.')
            time.sleep(10)
        raise TimeoutError('Notarization is still pending. Retain the submission ID and check it before resubmitting.')

def package(app):
    version = check_version(app)
    DIST.mkdir(exist_ok=True)
    output = DIST / f'Auto-Subtitle-{version}-arm64.dmg'
    assert not output.exists(), 'Never overwrite a release asset; move an unpublished candidate aside first.'
    with tempfile.TemporaryDirectory(prefix='auto-subtitle-release-', dir='/private/tmp') as temporary:
        folder = Path(temporary)
        archive = folder / 'Auto-Subtitle.app.zip'
        run('ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, archive)
        notarize(archive, 'APP')
        run('xcrun', 'stapler', 'staple', app)
        run('xcrun', 'stapler', 'validate', app)
        run('spctl', '--assess', '--type', 'execute', '--verbose=2', app)
        stage = folder / 'stage'
        stage.mkdir()
        run('ditto', '--norsrc', '--noextattr', app, stage / 'Auto Subtitle.app')
        (stage / 'Applications').symlink_to('/Applications')
        image = folder / output.name
        run('hdiutil', 'create', '-fs', 'HFS+', '-format', 'UDZO', '-srcfolder', stage, '-volname', 'Auto Subtitle', image)
        run('codesign', '--force', '--timestamp', '--sign', IDENTITY, image)
        notarize(image, 'DMG')
        run('xcrun', 'stapler', 'staple', image)
        run('xcrun', 'stapler', 'validate', image)
        run('spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', image)
        shutil.copyfile(image, output)
    print(output, flush=True)

def verify(image):
    run('codesign', '--verify', '--verbose=2', image)
    run('xcrun', 'stapler', 'validate', image)
    run('spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', image)
    with tempfile.TemporaryDirectory(prefix='auto-subtitle-verify-', dir='/private/tmp') as temporary:
        mount = Path(temporary) / 'mount'
        mount.mkdir()
        run('hdiutil', 'attach', '-readonly', '-nobrowse', '-mountpoint', mount, image)
        try:
            assert {p.name for p in mount.iterdir() if not p.name.startswith('.')} == {'Auto Subtitle.app', 'Applications'}
            assert os.readlink(mount / 'Applications') == '/Applications'
            app = mount / 'Auto Subtitle.app'
            check_version(app)
            run('codesign', '--verify', '--deep', '--strict', app)
            run('xcrun', 'stapler', 'validate', app)
            run('spctl', '--assess', '--type', 'execute', '--verbose=2', app)
            metadata = subprocess.run(['codesign', '-dv', str(app)], capture_output=True, text=True, check=True).stderr
            assert f'TeamIdentifier={TEAM}' in metadata and 'runtime' in metadata
            run('python3', ROOT / 'scripts/verify-bundle.py', app)
        finally:
            run('hdiutil', 'detach', mount)

def appcast(image):
    tool = ROOT / 'macos/.build/artifacts/sparkle/Sparkle/bin/generate_appcast'
    version = json.loads((ROOT / 'package.json').read_text())['version']
    with tempfile.TemporaryDirectory(prefix='auto-subtitle-appcast-', dir='/private/tmp') as temporary:
        folder = Path(temporary)
        shutil.copyfile(image, folder / image.name)
        shutil.copyfile(ROOT / 'CHANGELOG.md', folder / (image.stem + '.md'))
        run(tool, '--ed-key-file', AUTH / 'auto-subtitle-sparkle-ed25519-private.key',
            '--download-url-prefix', f'https://github.com/aindaco1/auto-subtitle/releases/download/v{version}/',
            '--link', 'https://github.com/aindaco1/auto-subtitle', '--embed-release-notes', '--maximum-versions', '1',
            '-o', DIST / 'appcast.xml', folder)
    run(tool.with_name('sign_update'), '--ed-key-file', AUTH / 'auto-subtitle-sparkle-ed25519-private.key', DIST / 'appcast.xml')
    document = ET.parse(DIST / 'appcast.xml')
    enclosure = document.find('./channel/item/enclosure')
    ns = '{http://www.andymatuschak.org/xml-namespaces/sparkle}'
    assert enclosure is not None and enclosure.get(ns + 'edSignature')
    assert enclosure.get('url') == f'https://github.com/aindaco1/auto-subtitle/releases/download/v{version}/{image.name}'
    assert int(enclosure.get('length')) == image.stat().st_size
    files = [image, DIST / 'appcast.xml', DIST / 'NOTARIZATION-APP.json', DIST / 'NOTARIZATION-DMG.json']
    (DIST / 'SHA256SUMS').write_text(''.join(f'{hashlib.file_digest(p.open("rb"), "sha256").hexdigest()}  {p.name}\n' for p in files))
    print('Signed appcast and release checksums ready.', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['sign', 'package', 'verify', 'appcast'])
    parser.add_argument('artifact', type=lambda s: Path(s).resolve())
    options = parser.parse_args()
    globals()[options.stage](options.artifact)
