#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import shlex
import subprocess
import textwrap
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable


_LANGUAGE_ALIASES = {
    "auto": None,
    "": None,
    "af": "Afrikaans",
    "afrikaans": "Afrikaans",
    "ar": "Arabic",
    "arabic": "Arabic",
    "hy": "Armenian",
    "armenian": "Armenian",
    "az": "Azerbaijani",
    "azerbaijani": "Azerbaijani",
    "be": "Belarusian",
    "belarusian": "Belarusian",
    "bs": "Bosnian",
    "bosnian": "Bosnian",
    "bg": "Bulgarian",
    "bulgarian": "Bulgarian",
    "ca": "Catalan",
    "catalan": "Catalan",
    "zh": "Chinese",
    "zhcn": "Chinese",
    "zhtw": "Chinese",
    "chinese": "Chinese",
    "hr": "Croatian",
    "croatian": "Croatian",
    "cs": "Czech",
    "czech": "Czech",
    "da": "Danish",
    "danish": "Danish",
    "nl": "Dutch",
    "dutch": "Dutch",
    "en": "English",
    "english": "English",
    "et": "Estonian",
    "estonian": "Estonian",
    "fi": "Finnish",
    "finnish": "Finnish",
    "fr": "French",
    "french": "French",
    "gl": "Galician",
    "galician": "Galician",
    "de": "German",
    "german": "German",
    "el": "Greek",
    "greek": "Greek",
    "he": "Hebrew",
    "hebrew": "Hebrew",
    "hi": "Hindi",
    "hindi": "Hindi",
    "hu": "Hungarian",
    "hungarian": "Hungarian",
    "is": "Icelandic",
    "icelandic": "Icelandic",
    "id": "Indonesian",
    "indonesian": "Indonesian",
    "it": "Italian",
    "italian": "Italian",
    "ja": "Japanese",
    "japanese": "Japanese",
    "kn": "Kannada",
    "kannada": "Kannada",
    "kk": "Kazakh",
    "kazakh": "Kazakh",
    "ko": "Korean",
    "korean": "Korean",
    "lv": "Latvian",
    "latvian": "Latvian",
    "lt": "Lithuanian",
    "lithuanian": "Lithuanian",
    "mk": "Macedonian",
    "macedonian": "Macedonian",
    "ms": "Malay",
    "malay": "Malay",
    "mr": "Marathi",
    "marathi": "Marathi",
    "mi": "Maori",
    "maori": "Maori",
    "ne": "Nepali",
    "nepali": "Nepali",
    "no": "Norwegian",
    "norwegian": "Norwegian",
    "fa": "Persian",
    "persian": "Persian",
    "pl": "Polish",
    "polish": "Polish",
    "pt": "Portuguese",
    "ptbr": "Portuguese",
    "portuguese": "Portuguese",
    "ro": "Romanian",
    "romanian": "Romanian",
    "ru": "Russian",
    "russian": "Russian",
    "sr": "Serbian",
    "serbian": "Serbian",
    "sk": "Slovak",
    "slovak": "Slovak",
    "sl": "Slovenian",
    "slovenian": "Slovenian",
    "es": "Spanish",
    "esmx": "Spanish",
    "espe": "Spanish",
    "espanol": "Spanish",
    "español": "Spanish",
    "spanish": "Spanish",
    "sw": "Swahili",
    "swahili": "Swahili",
    "sv": "Swedish",
    "swedish": "Swedish",
    "tl": "Tagalog",
    "tagalog": "Tagalog",
    "ta": "Tamil",
    "tamil": "Tamil",
    "th": "Thai",
    "thai": "Thai",
    "tr": "Turkish",
    "turkish": "Turkish",
    "uk": "Ukrainian",
    "ukrainian": "Ukrainian",
    "ur": "Urdu",
    "urdu": "Urdu",
    "vi": "Vietnamese",
    "vietnamese": "Vietnamese",
    "cy": "Welsh",
    "welsh": "Welsh",
}


@dataclass
class Cue:
    index: int
    start: float
    end: float
    text: str
    speaker: str | None = None


@dataclass
class SpeakerTurn:
    start: float
    end: float
    speaker: str


@dataclass
class WhisperWord:
    text: str
    start: float
    end: float


def parse_srt_timestamp(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def format_srt_timestamp(value: float) -> str:
    millis = round(value * 1000)
    hours, rem = divmod(millis, 3600 * 1000)
    minutes, rem = divmod(rem, 60 * 1000)
    seconds, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def normalize_text(text: str) -> str:
    text = text.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    text = text.replace("ü", "u").replace("ñ", "n")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def parse_srt(path: Path) -> list[Cue]:
    content = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\s*\n", content.strip())
    cues: list[Cue] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.splitlines() if line.strip() != ""]
        if len(lines) < 2 or "-->" not in lines[1]:
            continue
        index = int(lines[0]) if lines[0].isdigit() else len(cues) + 1
        start_text, end_text = [part.strip() for part in lines[1].split("-->")]
        cues.append(Cue(index=index, start=parse_srt_timestamp(start_text), end=parse_srt_timestamp(end_text), text="\n".join(lines[2:]).strip()))
    return cues


def render_text(cue: Cue, speaker_labels: bool = False) -> str:
    text = cue.text.strip()
    if speaker_labels and cue.speaker:
        return f"[{cue.speaker}] {text}"
    return text


def write_srt(cues: Iterable[Cue], path: Path, speaker_labels: bool = False) -> None:
    rows = []
    for idx, cue in enumerate(cues, start=1):
        rows.append(str(idx))
        rows.append(f"{format_srt_timestamp(cue.start)} --> {format_srt_timestamp(cue.end)}")
        rows.append(render_text(cue, speaker_labels=speaker_labels))
        rows.append("")
    path.write_text("\n".join(rows).strip() + "\n", encoding="utf-8")


def words_from_whisper_json(path: Path) -> list[WhisperWord]:
    data = json.loads(path.read_text(encoding="utf-8"))
    words: list[WhisperWord] = []
    for seg in data.get("segments", []):
        if seg.get("words"):
            for word in seg["words"]:
                start = word.get("start")
                end = word.get("end")
                token = word.get("word", "").strip()
                if start is None or end is None or not token:
                    continue
                words.append(WhisperWord(token, float(start), float(end)))
        else:
            text = seg.get("text", "").strip()
            if text:
                words.append(WhisperWord(text, float(seg["start"]), float(seg["end"])))
    return words


_END_PUNCT = re.compile(r"[.!?…:]$", re.UNICODE)


def split_words_into_cues(words: list[WhisperWord], pause_threshold: float = 0.65, max_words: int = 14) -> list[Cue]:
    if not words:
        return []
    cues: list[Cue] = []
    current: list[WhisperWord] = [words[0]]

    for previous, word in zip(words, words[1:]):
        pause = word.start - previous.end
        should_split = pause >= pause_threshold or len(current) >= max_words
        if _END_PUNCT.search(previous.text) and pause >= pause_threshold / 2:
            should_split = True
        if should_split:
            cues.append(cue_from_words(current, len(cues) + 1))
            current = [word]
        else:
            current.append(word)
    if current:
        cues.append(cue_from_words(current, len(cues) + 1))
    return cues


def cue_from_words(words: list[WhisperWord], index: int) -> Cue:
    text = " ".join(word.text for word in words)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([¿¡])\s+", r"\1", text)
    return Cue(index=index, start=words[0].start, end=words[-1].end, text=text.strip())


def cues_from_whisper_json(path: Path, pause_threshold: float = 0.65, max_words: int = 14) -> list[Cue]:
    return split_words_into_cues(words_from_whisper_json(path), pause_threshold=pause_threshold, max_words=max_words)


def overlap_seconds(a: Cue, b: Cue) -> float:
    return max(0.0, min(a.end, b.end) - max(a.start, b.start))


def align_and_improve(existing: list[Cue], whisper_segments: list[Cue], similarity_threshold: float = 0.58) -> tuple[list[Cue], list[dict[str, object]]]:
    improved: list[Cue] = []
    review: list[dict[str, object]] = []
    used_whisper: set[int] = set()

    for cue in existing:
        nearby = [
            (i, segment)
            for i, segment in enumerate(whisper_segments)
            if segment.end >= cue.start - 1.2 and segment.start <= cue.end + 1.2
        ]

        if not nearby:
            improved.append(cue)
            review.append(review_row("no_whisper_match", cue, source_text=cue.text))
            continue

        combined_text = " ".join(segment.text for _, segment in nearby)
        multi_similarity = similarity(cue.text, combined_text)
        cue_span = cue.end - cue.start
        nearby_span = nearby[-1][1].end - nearby[0][1].start
        multiple_turns_likely = len(re.findall(r"[.!?…]", cue.text)) >= 2 or "\n" in cue.text
        split_candidate = (
            len(nearby) > 1
            and multi_similarity >= max(0.5, similarity_threshold)
            and nearby_span <= cue_span + 0.45
            and multiple_turns_likely
        )

        if split_candidate:
            for i, segment in nearby:
                improved.append(Cue(index=len(improved) + 1, start=segment.start, end=segment.end, text=segment.text))
                used_whisper.add(i)
            review.append(review_row("split_existing_cue", cue, source_text=cue.text, text=combined_text))
            continue

        best_index, best_segment, best_score = max(
            ((i, segment, similarity(cue.text, segment.text)) for i, segment in nearby),
            key=lambda item: (item[2], overlap_seconds(cue, item[1])),
        )
        used_whisper.add(best_index)

        chosen_text = cue.text if best_score >= similarity_threshold else best_segment.text
        improved.append(Cue(index=len(improved) + 1, start=best_segment.start, end=best_segment.end, text=chosen_text))

        if best_score < similarity_threshold:
            review.append(review_row("low_similarity", best_segment, source_text=cue.text, text=best_segment.text))

    for i, segment in enumerate(whisper_segments):
        if i in used_whisper:
            continue
        covered = any(
            overlap_seconds(improved_cue, segment) > min(0.35, (segment.end - segment.start) * 0.8)
            and similarity(improved_cue.text, segment.text) >= 0.86
            for improved_cue in improved
        )
        if covered:
            continue
        improved.append(Cue(index=len(improved) + 1, start=segment.start, end=segment.end, text=segment.text))
        review.append(review_row("missing_from_existing", segment, source_text="", text=segment.text))

    improved.sort(key=lambda cue: (cue.start, cue.end))
    improved = renumber(normalize_durations(improved))
    return improved, review


def normalize_durations(cues: list[Cue]) -> list[Cue]:
    normalized: list[Cue] = []
    for idx, cue in enumerate(cues):
        start = max(0.0, cue.start)
        text = cue.text.strip()
        visible_chars = len(text.replace("\n", " "))
        max_reasonable = max(1.2, min(7.0, 0.9 + (visible_chars / 12.0)))
        end = max(start + 0.5, cue.end)
        end = min(end, start + max_reasonable)
        if idx + 1 < len(cues):
            next_start = cues[idx + 1].start
            if end > next_start - 0.02:
                end = max(start + 0.35, next_start - 0.02)
        normalized.append(Cue(index=idx + 1, start=start, end=end, text=text, speaker=cue.speaker))
    return normalized


def renumber(cues: list[Cue]) -> list[Cue]:
    return [Cue(index=i, start=cue.start, end=cue.end, text=cue.text, speaker=cue.speaker) for i, cue in enumerate(cues, start=1)]


def review_row(reason: str, cue: Cue, source_text: str = "", text: str | None = None) -> dict[str, object]:
    return {
        "reason": reason,
        "start": round(cue.start, 3),
        "end": round(cue.end, 3),
        "text": text if text is not None else cue.text,
        "source_text": source_text,
    }


def write_review_csv(rows: list[dict[str, object]], path: Path) -> None:
    fieldnames = ["reason", "start", "end", "text", "source_text"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_rttm(path: Path) -> list[SpeakerTurn]:
    turns: list[SpeakerTurn] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split()
        if len(parts) < 8 or parts[0] != "SPEAKER":
            continue
        start = float(parts[3])
        duration = float(parts[4])
        speaker = parts[7]
        turns.append(SpeakerTurn(start=start, end=round(start + duration, 3), speaker=speaker))
    return turns


def overlap_interval(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))


def apply_speaker_turns(cues: list[Cue], speaker_turns: list[SpeakerTurn]) -> list[Cue]:
    if not cues or not speaker_turns:
        return cues

    split: list[Cue] = []
    for cue in cues:
        overlaps = [
            turn for turn in speaker_turns
            if overlap_interval(cue.start, cue.end, turn.start, turn.end) > 0.05
        ]
        if not overlaps:
            split.append(Cue(index=len(split) + 1, start=cue.start, end=cue.end, text=cue.text, speaker=cue.speaker))
            continue

        ordered_speakers: list[str] = []
        for turn in sorted(overlaps, key=lambda item: (item.start, item.end)):
            if turn.speaker != (ordered_speakers[-1] if ordered_speakers else None):
                ordered_speakers.append(turn.speaker)

        if len(ordered_speakers) == 1:
            split.append(Cue(index=len(split) + 1, start=cue.start, end=cue.end, text=cue.text, speaker=ordered_speakers[0]))
            continue

        units = _split_text_units(cue.text)
        if len(units) < len(ordered_speakers):
            units = _chunk_text_by_limits(cue.text, max_chars=84, line_width=42, max_lines=2)
        if len(units) <= 1:
            best = max(overlaps, key=lambda item: overlap_interval(cue.start, cue.end, item.start, item.end))
            split.append(Cue(index=len(split) + 1, start=cue.start, end=cue.end, text=cue.text, speaker=best.speaker))
            continue

        if len(units) < len(ordered_speakers):
            units.extend([units[-1]] * (len(ordered_speakers) - len(units)))
        if len(units) > len(ordered_speakers):
            overflow = units[len(ordered_speakers) - 1 :]
            units = units[: len(ordered_speakers) - 1] + [" ".join(overflow)]

        total_chars = sum(max(len(unit.strip()), 1) for unit in units)
        cursor = cue.start
        for idx, (speaker, unit) in enumerate(zip(ordered_speakers, units)):
            unit_chars = max(len(unit.strip()), 1)
            if idx == len(units) - 1:
                end = cue.end
            else:
                duration = max(0.35, (cue.end - cue.start) * (unit_chars / total_chars))
                end = min(cue.end, cursor + duration)
            split.append(Cue(index=len(split) + 1, start=cursor, end=end, text=unit.strip(), speaker=speaker))
            cursor = end
    return split


def run_pyannote_diarization(audio_input: Path, rttm_output: Path, hf_token_env: str = "HF_TOKEN", dry_run: bool = False) -> None:
    command = [
        "python3",
        "-m",
        "auto_subtitle.diarize",
        str(audio_input),
        str(rttm_output),
        "--hf-token-env",
        hf_token_env,
    ]
    run(command, dry_run=dry_run)


def normalize_model_name(model: str) -> str:
    alias_map = {
        "turbo": "medium",
    }
    return alias_map.get(model, model)


def normalize_language_name(language: str | None) -> str | None:
    if language is None:
        return None
    cleaned = re.sub(r"[^\w]+", "", language.strip().lower())
    if cleaned in _LANGUAGE_ALIASES:
        return _LANGUAGE_ALIASES[cleaned]
    if not cleaned:
        return None
    if len(cleaned) > 2 and cleaned[:2] in _LANGUAGE_ALIASES:
        return _LANGUAGE_ALIASES[cleaned[:2]]
    return language.strip().title()


def chunk_ranges(duration: float, chunk_seconds: float, overlap_seconds: float = 1.0) -> list[tuple[float, float]]:
    if duration <= 0:
        return []
    if chunk_seconds <= 0:
        return [(0.0, round(duration, 3))]
    if overlap_seconds < 0:
        raise ValueError("overlap_seconds must be >= 0")
    if overlap_seconds >= chunk_seconds:
        raise ValueError("overlap_seconds must be smaller than chunk_seconds")

    ranges: list[tuple[float, float]] = []
    start = 0.0
    while start < duration:
        end = min(duration, start + chunk_seconds)
        ranges.append((round(start, 3), round(end, 3)))
        if end >= duration:
            break
        start = end - overlap_seconds
    return ranges


_PROMPT_HALLUCINATION_SNIPPETS = (
    "pelicula peruana de 1996",
    "escripcion literal",
    "conserva modismos y vulgarismos",
)


def cleanup_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[\]\[)}(.,;:]+\s*", "", text)
    if normalize_text(text) in _PROMPT_HALLUCINATION_SNIPPETS:
        return ""
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text



def cleanup_cues(cues: list[Cue], min_duration: float = 0.08) -> list[Cue]:
    cleaned: list[Cue] = []
    for cue in cues:
        if cue.end - cue.start < min_duration:
            continue
        text = cleanup_text(cue.text)
        if not text:
            continue
        cleaned.append(Cue(index=len(cleaned) + 1, start=cue.start, end=cue.end, text=text, speaker=cue.speaker))
    return cleaned


def dedupe_adjacent_cues(cues: list[Cue], similarity_threshold: float = 0.9, max_gap: float = 2.5) -> list[Cue]:
    if not cues:
        return []

    deduped: list[Cue] = [Cue(index=1, start=cues[0].start, end=cues[0].end, text=cues[0].text, speaker=cues[0].speaker)]
    for cue in cues[1:]:
        previous = deduped[-1]
        same_enough = similarity(previous.text, cue.text) >= similarity_threshold
        close_enough = cue.start - previous.end <= max_gap
        same_speaker = previous.speaker == cue.speaker
        if same_enough and close_enough and same_speaker:
            deduped[-1] = Cue(
                index=previous.index,
                start=previous.start,
                end=max(previous.end, cue.end),
                text=previous.text,
                speaker=previous.speaker,
            )
            continue
        deduped.append(Cue(index=len(deduped) + 1, start=cue.start, end=cue.end, text=cue.text, speaker=cue.speaker))
    return deduped



def _split_text_units(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = [part.strip() for part in re.split(r"(?<=[.!?…])\s+", text) if part.strip()]
    return parts or [text]



def _wrap_chunk(text: str, line_width: int) -> str:
    wrapped = textwrap.wrap(text, width=line_width, break_long_words=False, break_on_hyphens=False)
    return "\n".join(wrapped) if wrapped else text



def _chunk_text_by_limits(text: str, max_chars: int, line_width: int, max_lines: int) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    current_words: list[str] = []
    for word in words:
        candidate_words = current_words + [word]
        candidate = " ".join(candidate_words)
        wrapped = _wrap_chunk(candidate, line_width)
        if current_words and (len(wrapped) > max_chars or wrapped.count("\n") + 1 > max_lines):
            chunks.append(_wrap_chunk(" ".join(current_words), line_width))
            current_words = [word]
        else:
            current_words = candidate_words
    if current_words:
        chunks.append(_wrap_chunk(" ".join(current_words), line_width))
    return chunks



def resplit_oversized_cues(cues: list[Cue], max_chars: int = 84, line_width: int = 42, max_lines: int = 3) -> list[Cue]:
    resplit: list[Cue] = []
    for cue in cues:
        line_count = cue.text.count("\n") + 1
        if len(cue.text) <= max_chars and line_count <= max_lines:
            resplit.append(Cue(index=len(resplit) + 1, start=cue.start, end=cue.end, text=_wrap_chunk(cue.text, line_width), speaker=cue.speaker))
            continue

        units = _split_text_units(cue.text)
        chunks: list[str] = []
        current = ""
        for unit in units:
            candidate = f"{current} {unit}".strip() if current else unit
            wrapped_candidate = _wrap_chunk(candidate, line_width)
            wrapped_unit = _wrap_chunk(unit, line_width)
            if current and (len(wrapped_candidate) > max_chars or wrapped_candidate.count("\n") + 1 > max_lines):
                chunks.extend(_chunk_text_by_limits(current, max_chars, line_width, max_lines))
                current = unit
            elif not current and (len(wrapped_unit) > max_chars or wrapped_unit.count("\n") + 1 > max_lines):
                chunks.extend(_chunk_text_by_limits(unit, max_chars, line_width, max_lines))
                current = ""
            else:
                current = candidate
        if current:
            chunks.extend(_chunk_text_by_limits(current, max_chars, line_width, max_lines))

        if not chunks:
            chunks = _chunk_text_by_limits(cue.text, max_chars, line_width, max_lines) or [_wrap_chunk(cue.text, line_width)]

        total_chars = sum(max(len(chunk.replace("\n", " ")), 1) for chunk in chunks)
        span = max(cue.end - cue.start, 0.6)
        cursor = cue.start
        for idx, chunk in enumerate(chunks):
            weight = max(len(chunk.replace("\n", " ")), 1)
            if idx == len(chunks) - 1:
                end = cue.end
            else:
                duration = span * (weight / total_chars)
                end = min(cue.end, cursor + max(0.6, duration))
            resplit.append(Cue(index=len(resplit) + 1, start=cursor, end=end, text=chunk, speaker=cue.speaker))
            cursor = end
    return resplit



def finalize_cues(cues: list[Cue]) -> list[Cue]:
    cleaned = cleanup_cues(cues)
    deduped = dedupe_adjacent_cues(cleaned)
    resplit = resplit_oversized_cues(deduped)
    normalized = normalize_durations(cleanup_cues(resplit))
    return renumber(normalized)



def merge_whisper_json_chunks(chunks: list[tuple[Path, float]]) -> dict[str, object]:
    merged_segments: list[dict[str, object]] = []
    last_end = -1.0
    for path, offset in chunks:
        data = json.loads(path.read_text(encoding="utf-8"))
        for segment in data.get("segments", []):
            adjusted = dict(segment)
            adjusted_start = round(float(segment.get("start", 0.0)) + offset, 3)
            adjusted_end = round(float(segment.get("end", 0.0)) + offset, 3)
            if adjusted_end <= last_end + 0.05:
                continue
            adjusted["id"] = len(merged_segments)
            adjusted["start"] = adjusted_start
            adjusted["end"] = adjusted_end
            words = []
            for word in segment.get("words", []) or []:
                adjusted_word = dict(word)
                if "start" in adjusted_word:
                    adjusted_word["start"] = round(float(adjusted_word["start"]) + offset, 3)
                if "end" in adjusted_word:
                    adjusted_word["end"] = round(float(adjusted_word["end"]) + offset, 3)
                words.append(adjusted_word)
            if words:
                adjusted["words"] = words
            merged_segments.append(adjusted)
            last_end = adjusted_end
    return {
        "text": " ".join(str(segment.get("text", "")).strip() for segment in merged_segments if str(segment.get("text", "")).strip()),
        "segments": merged_segments,
    }



def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())



def run_whisper(audio_input: Path, output_dir: Path, whisper_json_path: Path, language: str | None, model: str, initial_prompt: str = "", dry_run: bool = False) -> None:
    whisper_command = [
        "whisper", str(audio_input), "--task", "transcribe", "--model", model,
        "--word_timestamps", "True", "--output_format", "json", "--output_dir", str(output_dir),
    ]
    if language:
        whisper_command.extend(["--language", language])
    if initial_prompt:
        whisper_command.extend(["--initial_prompt", initial_prompt])
    run(whisper_command, dry_run=dry_run)
    if dry_run:
        return
    emitted_json = output_dir / f"{audio_input.stem}.json"
    if emitted_json != whisper_json_path and emitted_json.exists():
        whisper_json_path.write_text(emitted_json.read_text(encoding="utf-8"), encoding="utf-8")



def run_whisper_chunked(audio_input: Path, output_dir: Path, whisper_json_path: Path, language: str, model: str, chunk_seconds: float, overlap_seconds: float = 1.0, initial_prompt: str = "", dry_run: bool = False) -> None:
    duration = probe_duration(audio_input)
    chunk_dir = output_dir / f"{audio_input.stem}.chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    ranges = chunk_ranges(duration, chunk_seconds=chunk_seconds, overlap_seconds=overlap_seconds)
    chunk_outputs: list[tuple[Path, float]] = []

    for idx, (start, end) in enumerate(ranges, start=1):
        chunk_audio = chunk_dir / f"{audio_input.stem}.part{idx:03d}.wav"
        chunk_duration = round(end - start, 3)
        run([
            "ffmpeg", "-y", "-ss", str(start), "-i", str(audio_input), "-t", str(chunk_duration), "-ac", "1", "-ar", "16000", str(chunk_audio)
        ], dry_run=dry_run)
        run_whisper(chunk_audio, chunk_dir, chunk_dir / f"{chunk_audio.stem}.json", language=language, model=model, initial_prompt=initial_prompt, dry_run=dry_run)
        chunk_outputs.append((chunk_dir / f"{chunk_audio.stem}.json", start))

    if dry_run:
        return
    merged = merge_whisper_json_chunks(chunk_outputs)
    whisper_json_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")



def run(command: list[str], dry_run: bool = False) -> None:
    printable = " ".join(shlex.quote(part) for part in command)
    print(printable)
    if dry_run:
        return
    subprocess.run(command, check=True)


def run_ffsubsync(video: Path, existing_srt: Path, output_path: Path, vad: str, dry_run: bool = False) -> None:
    preferred = [vad]
    for fallback in ("subs_then_webrtc", "webrtc"):
        if fallback not in preferred:
            preferred.append(fallback)

    last_error: subprocess.CalledProcessError | None = None
    for current_vad in preferred:
        try:
            run([
                "ffsubsync", str(video), "-i", str(existing_srt), "-o", str(output_path), "--vad", current_vad
            ], dry_run=dry_run)
            return
        except subprocess.CalledProcessError as exc:
            last_error = exc
            print(f"ffsubsync failed with VAD={current_vad}; trying fallback...")
    if last_error is not None:
        raise last_error


def derive_output_paths(video: Path, existing_srt: Path, output_dir: Path) -> dict[str, Path]:
    stem = video.stem
    return {
        "audio": output_dir / f"{stem}.clean.wav",
        "synced": output_dir / f"{existing_srt.stem}.synced.srt",
        "whisper_json": output_dir / f"{stem}.clean.json",
        "whisper_srt": output_dir / f"{stem}.clean.srt",
        "diarization": output_dir / f"{stem}.speakers.rttm",
        "improved": output_dir / f"{stem}.improved.srt",
        "review": output_dir / f"{stem}.review.csv",
    }


def run_pipeline(args: argparse.Namespace) -> dict[str, Path]:
    video = Path(args.video).expanduser().resolve()
    existing_srt = Path(args.existing_srt).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = derive_output_paths(video, existing_srt, output_dir)
    whisper_model = normalize_model_name(args.model)
    whisper_language = normalize_language_name(args.language)

    if not args.skip_audio_extract:
        run([
            "ffmpeg", "-y", "-i", str(video), "-map", "0:a:0", "-ac", "1", "-ar", "16000",
            "-af", "highpass=f=120,lowpass=f=7600,loudnorm", str(outputs["audio"])
        ], dry_run=args.dry_run)

    audio_input = outputs["audio"] if outputs["audio"].exists() or not args.skip_audio_extract else video

    if not args.skip_sync:
        run_ffsubsync(video, existing_srt, outputs["synced"], args.vad, dry_run=args.dry_run)
    synced_path = outputs["synced"] if outputs["synced"].exists() or not args.skip_sync else existing_srt

    if not args.skip_whisper:
        if args.chunk_seconds > 0:
            run_whisper_chunked(
                audio_input,
                output_dir,
                outputs["whisper_json"],
                language=whisper_language,
                model=whisper_model,
                chunk_seconds=args.chunk_seconds,
                overlap_seconds=args.chunk_overlap_seconds,
                initial_prompt=args.initial_prompt,
                dry_run=args.dry_run,
            )
        else:
            run_whisper(
                audio_input,
                output_dir,
                outputs["whisper_json"],
                language=whisper_language,
                model=whisper_model,
                initial_prompt=args.initial_prompt,
                dry_run=args.dry_run,
            )

    if args.speaker_mode == "pyannote":
        run_pyannote_diarization(
            audio_input=audio_input,
            rttm_output=outputs["diarization"],
            hf_token_env=args.hf_token_env,
            dry_run=args.dry_run,
        )

    if args.dry_run:
        return outputs

    synced_cues = parse_srt(synced_path if synced_path.exists() else existing_srt)
    whisper_cues = cues_from_whisper_json(outputs["whisper_json"], pause_threshold=args.pause_threshold, max_words=args.max_words)
    improved_cues, review_rows = align_and_improve(synced_cues, whisper_cues, similarity_threshold=args.similarity_threshold)
    if args.speaker_mode == "pyannote" and outputs["diarization"].exists():
        improved_cues = apply_speaker_turns(improved_cues, parse_rttm(outputs["diarization"]))
    improved_cues = finalize_cues(improved_cues)
    write_srt(improved_cues, outputs["improved"], speaker_labels=args.speaker_labels)
    write_review_csv(review_rows, outputs["review"])
    return outputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync and rebuild subtitles from audio plus an existing SRT draft.",
        epilog="Language accepts Whisper names, ISO-style codes like es/fr/pt-BR, or 'auto'. Speaker diarization currently ships as an optional pyannote backend.",
    )
    parser.add_argument("video", help="Path to the source video or audio file")
    parser.add_argument("existing_srt", help="Path to the draft/reference SRT file")
    parser.add_argument("--output-dir", default=".", help="Directory for rebuilt subtitle artifacts")
    parser.add_argument("-l", "--language", default="auto", help="Whisper language name, code, or 'auto'")
    parser.add_argument("--model", default="medium")
    parser.add_argument("--vad", default="subs_then_webrtc")
    parser.add_argument("--pause-threshold", type=float, default=0.65)
    parser.add_argument("--max-words", type=int, default=14)
    parser.add_argument("--similarity-threshold", type=float, default=0.58)
    parser.add_argument("--initial-prompt", default="")
    parser.add_argument("--chunk-seconds", type=float, default=0.0)
    parser.add_argument("--chunk-overlap-seconds", type=float, default=1.0)
    parser.add_argument("--speaker-mode", choices=["none", "pyannote"], default="none")
    parser.add_argument("--speaker-labels", action="store_true", help="Prefix subtitle text with diarization speaker labels")
    parser.add_argument("--hf-token-env", default="HF_TOKEN", help="Environment variable holding the Hugging Face token for pyannote")
    parser.add_argument("--skip-audio-extract", action="store_true")
    parser.add_argument("--skip-sync", action="store_true")
    parser.add_argument("--skip-whisper", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    outputs = run_pipeline(args)
    for name, path in outputs.items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    main()
