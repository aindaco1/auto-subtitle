"""Relocate a copied python-build-standalone installation; never modify its source."""
import os
from pathlib import Path
import subprocess
import sys
root=Path(sys.argv[1]).resolve()
assert root.name=='python' and 'runtime' in root.parts
for file in root.rglob('*'):
    if file.is_symlink() or not file.is_file(): continue
    with file.open('rb') as handle: magic=handle.read(4)
    if magic!=b'\xcf\xfa\xed\xfe':continue
    lines=subprocess.check_output(['/usr/bin/otool','-L',str(file)],text=True).splitlines()[1:]
    for line in lines:
        dep=line.strip().split(' (')[0]
        if not dep.startswith('/') or dep.startswith(('/usr/lib/','/System/')):continue
        if '/lib/' not in dep:raise RuntimeError(f'Unexpected Python dependency: {dep}')
        target=root/'lib'/dep.split('/lib/',1)[1]
        if not target.exists():raise RuntimeError(f'Unbundled Python dependency: {target}')
        if target==file:
            subprocess.run(['/usr/bin/install_name_tool','-id','@rpath/'+target.name,str(file)],check=True)
        else:
            relative=os.path.relpath(target,file.parent)
            subprocess.run(['/usr/bin/install_name_tool','-change',dep,'@loader_path/'+relative,str(file)],check=True)
    subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(file)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
