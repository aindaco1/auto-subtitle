"""Validate packaged paths and Mach-O dependencies without developer PATH fallbacks."""
import os
import plistlib
import subprocess
import sys
from pathlib import Path
app=Path(sys.argv[1]).resolve()
info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
assert info['LSMinimumSystemVersion']=='15.0'
assert (app/'Contents/Resources/AppIcon.icns').stat().st_size>10000
root=app/'Contents/Resources/engine-root'
for file in app.rglob('*'):
    if file.is_symlink():
        assert file.resolve().is_relative_to(app),f'External link: {file}'
    elif file.is_file():
        with file.open('rb') as source: magic=source.read(4)
        if magic not in (b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca'): continue
        output=subprocess.check_output(['/usr/bin/otool','-L',str(file)],text=True)
        identifiers=subprocess.check_output(['/usr/bin/otool','-D',str(file)],text=True).splitlines()[1:]
        for line in output.splitlines()[1:]:
            if not line.startswith('\t'): continue
            dep=line.strip().split(' (')[0]
            if dep in identifiers: continue  # LC_ID_DYLIB is not a loaded dependency.
            assert dep.startswith(('/System/','/usr/lib/','@')),f'Unbundled dependency {file}: {dep}'
for tool in ['node','ffmpeg','ffprobe','auto-subtitle-speech','whisper-cli']:
    assert os.access(root/'runtime/macos-arm64/bin'/tool,os.X_OK)
subprocess.run([str(root/'runtime/macos-arm64/bin/whisper-cli'),'--version'],check=True,env={'PATH':'/usr/bin:/bin','HOME':os.path.expanduser('~')})
python=root/'runtime/macos-arm64/python/bin/python3.11'
subprocess.run([str(python),'-I','-c','import numpy,webrtcvad;from ffsubsync.aligners import FFTAligner'],check=True,env={'PATH':'/usr/bin:/bin','HOME':os.path.expanduser('~')})
print('Bundle structure, local runtime imports, symlinks and Mach-O dependencies verified.')
