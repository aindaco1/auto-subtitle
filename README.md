# Auto Subtitle

A small local subtitle app for Apple Silicon, targeting macOS 15 or later. Drop a video and an SRT or ASS file, then choose **Align subtitles**. Switch to **Generate subtitles** to create captions from the audio.

- Align detects uniform offsets and timing-rate differences, including 25↔30 conversions, before attempting detailed speech-activity alignment. Translated subtitles work without a speech model.
- Wording stays unchanged by default. **Improve accuracy** offers conservative audio-supported spelling corrections for subtitles in the spoken language, with additional context and local dictionary checks. It is disabled for known translations.
- **Clean up formatting** wraps long lines, combines exact continuous duplicates, and reports reading-speed problems. Turn it off to preserve imported cue structure. Existing ASS presentation is retained where the output format supports it.
- Generate uses local Parakeet v3 through RecordSpeech. Passage-level checks flag unexpected language changes. Optional local Whisper retries repair only wording supported by two audio decodes; uncertain passages remain unchanged and are listed for review.
- The top-right **Check for updates** button uses official GitHub releases through Sparkle. A quiet launch check looks for updates; installation requires your action.
- **Help & diagnostics** previews and exports a privacy-filtered JSON state snapshot. Reviewed current-state, failure and crash reports can create or join an issue in this repository through the existing Dust Wave crash relay.

Download **Auto Subtitle 1.0.0** from [official GitHub releases](https://github.com/aindaco1/auto-subtitle/releases/latest). The Apple Silicon app and DMG use Developer ID signing, Apple notarization and signed Sparkle updates. Recognition quality across all 25 languages, human-reviewed translation boundaries and clean minimum-hardware acceptance remain ongoing; see [validation](docs/validation.md).

Known Generate limitation: Parakeet can emit English within Spanish dialogue. The new selective repair pass reduces this in the supplied film, but does not resolve every passage. A manual language choice guides checking and retries; it is not a guaranteed language lock. See the [investigation and repair evidence](docs/investigations/2026-09-07-spanish-language-drift.md).

## Use the app

1. Choose Align or Generate and drop your files into the window. Select an audio track if there is more than one.
2. Choose SRT or ASS. Improve accuracy is optional and off by default.
3. Run, review the result summary, and save a new subtitle file. Originals cannot be overwritten.

Timing-only alignment needs no model. For Generate or Improve, open **Speech model**, choose **Find existing**, or import a compatible Core ML model. If none exists, Download installs the pinned, size- and SHA-256-verified model (about 483 MB). No account or token is required. Audio, subtitles, and recognition remain local after setup.

Generate’s **Options → Repair language mismatches** is on by default. **Speech models** can find, import, or download the optional Whisper large-v3-turbo model (about 1.62 GB). Likely app storage, MacWhisper, whisper.cpp, Hugging Face and Downloads locations are searched; existing files must match the pinned publisher size and SHA-256 before reuse. Both models can be downloaded directly through the app without another transcription app installed. No model downloads happen automatically. Without this model, Generate still flags suspicious passages and preserves their wording. Genuine spoken language switches are never automatically translated.

The app retains local checkpoints for retry. The **Local report** contains subtitle text and paths; use **Help & diagnostics → Export JSON** for a shareable report. Sending to GitHub is an explicit action after reviewing that JSON. See [privacy and reporting](docs/privacy.md).

## Develop

```sh
git submodule update --init --recursive
python3 scripts/prepare-runtime.py /path/to/podcast-visualizer/runtime/macos-arm64 /path/to/cpython-3.11.15-macos-aarch64-none
npm test
swift test --package-path macos
bash scripts/build-app.sh
```

The preparation script reuses only verified Node/FFmpeg files and prepares a separate locked Python runtime. The build bundles every executable; users need no Homebrew, Node, Python, or developer tools. It writes the app outside iCloud to keep signatures stable. [Build and packaging details](docs/development.md).

The optional Python CLI delegates to the same engine:

```sh
python3 -m pip install -e .
auto-subtitle movie.mkv draft.srt --output movie.aligned.srt
auto-subtitle movie.mkv --generate --format ass --output movie.subtitles.ass
```

The former Whisper workflow remains under `auto-subtitle legacy …`; its [legacy documentation](docs/legacy-cli.md) does not describe the new app.

## Project guides

- [Implementation plan and status](docs/implementation-plan.md)
- [Architecture and shared-code ownership](docs/architecture.md)
- [Subtitle quality policy and sources](docs/subtitle-quality-policy.md)
- [Validation evidence and remaining acceptance](docs/validation.md)
- [Signed release and updater runbook](docs/release-runbook.md)
- [Privacy and crash reporting](docs/privacy.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
