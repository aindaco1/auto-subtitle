"""Disk-image attachment recovery must never eject unrelated user volumes."""
import importlib.util
from pathlib import Path
import plistlib
from unittest import TestCase
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "release_packaging", Path(__file__).resolve().parents[1] / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class CreatedImageTests(TestCase):
    def test_detaches_only_matching_whole_disk(self):
        image = Path("/tmp/candidate.dmg")
        inventory = {"images": [
            {"image-path": "/tmp/unrelated.dmg", "system-entities": [
                {"dev-entry": "/dev/disk8"}]},
            {"image-path": str(image), "system-entities": [
                {"dev-entry": "/dev/disk9s1"}, {"dev-entry": "/dev/disk9"},
                {"dev-entry": "/dev/disk10"}]},
        ]}
        with patch.object(release.subprocess, "check_output", return_value=plistlib.dumps(inventory)), \
                patch.object(release, "run") as run:
            release.detach_created_image(image)
        run.assert_called_once_with("hdiutil", "detach", "/dev/disk9")

    def test_absent_attachment_needs_no_detach(self):
        with patch.object(release.subprocess, "check_output", return_value=plistlib.dumps({"images": []})), \
                patch.object(release, "run") as run:
            release.detach_created_image(Path("/tmp/candidate.dmg"))
        run.assert_not_called()

    def test_matching_image_without_whole_disk_fails_closed(self):
        image = Path("/tmp/candidate.dmg")
        inventory = {"images": [{"image-path": str(image), "system-entities": [
            {"dev-entry": "/dev/disk9s1"}]}]}
        with patch.object(release.subprocess, "check_output", return_value=plistlib.dumps(inventory)), \
                patch.object(release, "run") as run:
            with self.assertRaises(RuntimeError):
                release.detach_created_image(image)
        run.assert_not_called()
