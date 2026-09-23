"""The adapter must preserve cleanup-off semantics."""
import json
import sys
from pathlib import Path
import pytest
from auto_subtitle import cli

@pytest.mark.parametrize("flags,cleanup", [([],True),(["--no-cleanup"],False)])
def test_formatting_request(tmp_path, monkeypatch, flags, cleanup):
    (tmp_path/"runtime/macos-arm64/bin").mkdir(parents=True)
    (tmp_path/"runtime/macos-arm64/bin/node").touch()
    (tmp_path/"engine").mkdir()
    (tmp_path/"engine/cli.mjs").touch()
    monkeypatch.setenv("AUTO_SUBTITLE_ENGINE_ROOT",str(tmp_path))
    monkeypatch.setattr(sys,"argv",["auto-subtitle","movie.mp4","captions.ass","--translated",*flags])
    captured=[]
    def run(command):
        captured.append(json.loads(Path(command[-1]).read_text()))
        return 0
    monkeypatch.setattr(cli.subprocess,"call",run)
    with pytest.raises(SystemExit) as result:
        cli.main()
    assert result.value.code==0
    assert captured[0]["cleanup"] is cleanup
    assert captured[0]["translated"] is True
    assert captured[0]["improve"] is False
