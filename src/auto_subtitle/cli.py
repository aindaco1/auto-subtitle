"""Thin CLI adapter to the same engine shipped in the macOS app."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main() -> None:
    if sys.argv[1:2] == ['legacy']:
        from .workflow import build_parser, run_pipeline
        args = build_parser().parse_args(sys.argv[2:])
        for name, path in run_pipeline(args).items():
            print(f'{name}: {path}')
        return
    parser = argparse.ArgumentParser(description='Align subtitles locally, preserving wording and language.')
    parser.add_argument('video', type=Path)
    parser.add_argument('subtitle', type=Path, nargs='?')
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--format', choices=['srt', 'ass'], default='srt')
    parser.add_argument('--output', '-o', type=Path)
    parser.add_argument('--language', '-l', default='auto')
    parser.add_argument('--improve', action='store_true')
    parser.add_argument('--translated', action='store_true')
    parser.add_argument('--no-cleanup', action='store_true')
    parser.add_argument('--stream', type=int)
    args = parser.parse_args()
    if not args.generate and args.subtitle is None:
        parser.error('Supply a subtitle, or use --generate.')
    roots = [Path(__file__).resolve().parents[2], Path('/Applications/Auto Subtitle.app/Contents/Resources/engine-root'), Path.home()/'Applications/Auto Subtitle.app/Contents/Resources/engine-root']
    configured = os.environ.get('AUTO_SUBTITLE_ENGINE_ROOT')
    if configured: roots.insert(0, Path(configured).resolve())
    root = next((p for p in roots if (p/'runtime/macos-arm64/bin/node').is_file() and (p/'engine/cli.mjs').is_file()), None)
    if root is None:
        parser.error('Install Auto Subtitle.app or prepare this checkout’s bundled runtime first.')
    request = dict(schema=1, mode='generate' if args.generate else 'align', video=str(args.video.resolve()), format=args.format, language=args.language, improve=args.improve, translated=args.translated, cleanup=not args.no_cleanup)
    if args.subtitle and not args.generate: request['subtitle'] = str(args.subtitle.resolve())
    if args.output: request['output'] = str(args.output.resolve())
    if args.stream is not None: request['stream'] = args.stream
    with tempfile.TemporaryDirectory(prefix='auto-subtitle-request-') as temporary:
        file = Path(temporary)/'request.json'
        file.write_text(json.dumps(request), encoding='utf8')
        code = subprocess.call([str(root/'runtime/macos-arm64/bin/node'), str(root/'engine/cli.mjs'), 'run', str(file)])
    raise SystemExit(code)

if __name__ == "__main__":
    main()
