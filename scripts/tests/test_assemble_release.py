"""Exercise the real assembler with bounded files and a fake GitHub transport."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'assemble-release.py'


class AssemblyTests(unittest.TestCase):
    def exercise(self, *, draft=True, provider_digest_matches=True):
        image_name = 'Auto-Subtitle-1.0.6-arm64.dmg'
        chunks = [bytes([index]) for index in range(100)]
        expected = hashlib.sha256(b''.join(chunks)).hexdigest()
        release = {'id': 1, 'tag_name': 'v1.0.6', 'draft': draft, 'assets': []}
        self.deleted = []
        self.uploaded = False
        self.downloaded = False

        def transport(command, *, text):
            self.assertTrue(text)
            self.assertEqual(command[0], 'gh')
            args = command[1:]
            if args[0] == 'api' and args[-1].endswith('releases?per_page=100'):
                return json.dumps([[release]])
            if args[:2] == ['release', 'download']:
                self.downloaded = True
                folder = Path(args[args.index('--dir') + 1])
                for index, content in enumerate(chunks, 1):
                    (folder / f'upload-part-{index:03d}-of-100.bin').write_bytes(content)
                (folder / 'SHA256SUMS').write_text(f'{expected}  {image_name}\n')
                return ''
            if args[:2] == ['release', 'upload']:
                self.assertEqual(Path(args[-1]).read_bytes(), b''.join(chunks))
                self.uploaded = True
                return ''
            if args[0] == 'api' and '/assets' in args[-1]:
                parts = [{'name': f'upload-part-{index:03d}-of-100.bin'} for index in range(1, 101)]
                uploaded = {'name': image_name, 'state': 'uploaded',
                            'digest': 'sha256:' + (expected if provider_digest_matches else '0' * 64)}
                # The full image is on the second page at the maximum part count.
                if '--paginate' in args and '--slurp' in args:
                    return json.dumps([parts, [uploaded]])
                return json.dumps(parts[:30])
            if args[:2] == ['release', 'delete-asset']:
                self.assertTrue(self.uploaded)
                self.deleted.append(args[3])
                return ''
            self.fail(f'Unexpected command: {command}')

        with patch.dict(os.environ, {'RELEASE_TAG': 'v1.0.6', 'GH_REPO': 'aindaco1/auto-subtitle'}), \
                patch('subprocess.check_output', side_effect=transport):
            runpy.run_path(str(SCRIPT), run_name='__main__')

    def test_full_image_on_second_page_verified_before_all_parts_removed(self):
        self.exercise()
        self.assertEqual(self.deleted, [f'upload-part-{index:03d}-of-100.bin' for index in range(1, 101)])

    def test_wrong_provider_digest_preserves_every_part(self):
        with self.assertRaises(AssertionError):
            self.exercise(provider_digest_matches=False)
        self.assertTrue(self.uploaded)
        self.assertEqual(self.deleted, [])

    def test_published_release_is_never_downloaded_or_mutated(self):
        with self.assertRaisesRegex(AssertionError, 'Never mutate a published release'):
            self.exercise(draft=False)
        self.assertFalse(self.downloaded)
        self.assertFalse(self.uploaded)
        self.assertEqual(self.deleted, [])


if __name__ == '__main__':
    unittest.main()
