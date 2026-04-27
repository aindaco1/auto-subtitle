# auto-subtitle

auto-subtitle is a small CLI for rebuilding subtitles from a source video/audio file plus a rough SRT draft.

It is built for the ugly real-world case: the draft subtitles are partly useful, partly wrong, poorly timed, missing lines, and not cleanly split for dialogue.

The workflow is hybrid on purpose:
- use ffsubsync to recover timing against the real media
- use Whisper word timestamps to recover missing speech and pause structure
- keep draft text when it is still better than raw ASR
- split oversized cues into readable subtitle units
- optionally add speaker diarization labels with pyannote

## What it does

- extracts clean mono 16 kHz audio with ffmpeg
- re-syncs a draft SRT with ffsubsync
- runs Whisper and keeps word timestamps in JSON
- merges the synced draft with Whisper timing and missing lines
- deduplicates adjacent repeats
- re-splits huge subtitle blocks
- caps cue duration and cue length for readability
- optionally runs speaker diarization and prefixes cues with speaker IDs

## Requirements

Core tools:
- Python 3.10+
- ffmpeg
- ffprobe
- ffsubsync
- whisper CLI

Optional diarization:
- a Hugging Face token accepted by pyannote
- `pip install 'auto-subtitle[diarization]'`

## Install

Use a normal Python install or virtualenv. On macOS, avoid Apple's system Python for editable installs.

From the repo root:

```bash
python3 -m pip install -e .
```

If you want optional diarization support too:

```bash
python3 -m pip install -e '.[diarization]'
```

If your shell has not refreshed PATH yet, use the module form:

```bash
python3 -m auto_subtitle --help
```

## Basic usage

```bash
auto-subtitle movie.mkv draft.srt --output-dir out
```

Equivalent fallback:

```bash
python3 -m auto_subtitle movie.mkv draft.srt --output-dir out
```

Force a language explicitly:

```bash
auto-subtitle movie.mkv draft.srt -l es-PE --output-dir out
```

Use long-media chunking:

```bash
auto-subtitle movie.mkv draft.srt --chunk-seconds 600 --chunk-overlap-seconds 1 --output-dir out
```

Reuse existing artifacts instead of rerunning every stage:

```bash
auto-subtitle movie.mkv draft.srt \
  --output-dir out \
  --skip-audio-extract \
  --skip-sync \
  --skip-whisper
```

## Speaker diarization

The optional speaker backend is pyannote.

1. Install extras:

```bash
python3 -m pip install -e '.[diarization]'
```

2. Export a Hugging Face token:

```bash
export HF_TOKEN=your_token_here
```

3. Run with diarization enabled:

```bash
auto-subtitle movie.mkv draft.srt \
  --output-dir out \
  --speaker-mode pyannote \
  --speaker-labels
```

That writes an RTTM file alongside the rebuilt subtitle output and prefixes cues like:

```text
[SPEAKER_00] Va a tener que venir, capitán.
[SPEAKER_01] ¿Qué pasa?
```

Important: this is useful for separation and review, but it is still a best-effort automated pass. You should expect to spot-check dialogue-heavy scenes.

## Output files

For an input `movie.mkv` and a draft `draft.srt`, the tool writes files like:

- `movie.clean.wav`
- `draft.synced.srt`
- `movie.clean.json`
- `movie.clean.srt`
- `movie.speakers.rttm` when diarization is enabled
- `movie.improved.srt`
- `movie.review.csv`

## Language handling

The CLI accepts:
- Whisper language names
- short codes like `es`, `fr`, `pt`
- regional variants like `es-PE`, `pt-BR`
- `auto` for Whisper language detection

## Repo layout

```text
auto-subtitle/
├── pyproject.toml
├── README.md
├── src/
│   └── auto_subtitle/
│       ├── __init__.py
│       ├── __main__.py
│       ├── cli.py
│       ├── diarize.py
│       └── workflow.py
└── tests/
    └── test_workflow.py
```

## Development

Run tests:

```bash
PYTHONPATH=src pytest tests/test_workflow.py -q
```

Run help:

```bash
python3 -m auto_subtitle --help
```

## Limits

This tool improves timing, segmentation, and recovery of missing lines, but it does not magically solve every ASR problem.

Weak spots still include:
- heavy slang or dialect that Whisper hears badly
- overlapping speech
- songs, chants, crowd noise, and off-screen dialogue
- scenes where diarization segments are right but the wording still needs human cleanup

## License

MIT
