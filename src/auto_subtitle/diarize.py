from __future__ import annotations

import argparse
import os
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run optional pyannote speaker diarization and write RTTM output.")
    parser.add_argument("audio_input", help="Path to an audio or video file readable by ffmpeg")
    parser.add_argument("rttm_output", help="Path to the RTTM output file")
    parser.add_argument("--hf-token-env", default="HF_TOKEN", help="Environment variable that stores a Hugging Face token accepted by pyannote")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    token = os.environ.get(args.hf_token_env, "").strip()
    if not token:
        raise SystemExit(
            f"Missing Hugging Face token. Set {args.hf_token_env} before running pyannote diarization."
        )

    try:
        import torch
        from pyannote.audio import Pipeline
    except ImportError as exc:
        raise SystemExit(
            "pyannote diarization dependencies are not installed. Install with: pip install 'auto-subtitle[diarization]'"
        ) from exc

    audio_input = Path(args.audio_input).expanduser().resolve()
    rttm_output = Path(args.rttm_output).expanduser().resolve()
    rttm_output.parent.mkdir(parents=True, exist_ok=True)

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))

    diarization = pipeline(str(audio_input))
    with rttm_output.open("w", encoding="utf-8") as handle:
        diarization.write_rttm(handle)


if __name__ == "__main__":
    main()
