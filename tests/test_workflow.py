from pathlib import Path

import pytest

from auto_subtitle.workflow import (
    Cue,
    SpeakerTurn,
    WhisperWord,
    align_and_improve,
    apply_speaker_turns,
    build_parser,
    chunk_ranges,
    cleanup_cues,
    dedupe_adjacent_cues,
    finalize_cues,
    format_srt_timestamp,
    merge_whisper_json_chunks,
    normalize_language_name,
    normalize_model_name,
    parse_rttm,
    parse_srt_timestamp,
    render_text,
    resplit_oversized_cues,
    split_words_into_cues,
)


def test_parse_and_format_timestamp_round_trip():
    ts = "01:02:03,456"
    seconds = parse_srt_timestamp(ts)
    assert seconds == pytest.approx(3723.456)
    assert format_srt_timestamp(seconds) == ts


def test_normalize_model_name_maps_turbo_to_supported_model():
    assert normalize_model_name("turbo") == "medium"
    assert normalize_model_name("large") == "large"


def test_normalize_language_name_supports_aliases_and_auto_detection():
    assert normalize_language_name("es") == "Spanish"
    assert normalize_language_name("ES_pe") == "Spanish"
    assert normalize_language_name("español") == "Spanish"
    assert normalize_language_name("pt-BR") == "Portuguese"
    assert normalize_language_name("english") == "English"
    assert normalize_language_name("auto") is None
    assert normalize_language_name("") is None


def test_split_words_into_cues_breaks_on_long_pause_and_preserves_dialogue_lines():
    words = [
        WhisperWord("Hola", 0.0, 0.2),
        WhisperWord("Jorge.", 0.21, 0.5),
        WhisperWord("¿Qué", 1.4, 1.55),
        WhisperWord("pasó?", 1.56, 1.9),
    ]

    cues = split_words_into_cues(words, pause_threshold=0.6, max_words=6)

    assert len(cues) == 2
    assert cues[0].text == "Hola Jorge."
    assert cues[0].start == 0.0
    assert cues[0].end == 0.5
    assert cues[1].text == "¿Qué pasó?"
    assert cues[1].start == 1.4
    assert cues[1].end == 1.9


def test_align_and_improve_prefers_existing_text_but_uses_whisper_timing_and_inserts_missing():
    existing = [
        Cue(index=1, start=0.0, end=2.0, text="Pucha, qué fue."),
        Cue(index=2, start=5.0, end=7.0, text="No sé."),
    ]
    whisper_segments = [
        Cue(index=1, start=0.1, end=1.9, text="Pucha, que fue."),
        Cue(index=2, start=2.4, end=4.0, text="Recontra zanahoria."),
        Cue(index=3, start=5.1, end=6.8, text="No sé."),
    ]

    improved, review = align_and_improve(existing, whisper_segments, similarity_threshold=0.55)

    assert [cue.text for cue in improved] == [
        "Pucha, qué fue.",
        "Recontra zanahoria.",
        "No sé.",
    ]
    assert improved[0].start == pytest.approx(0.1)
    assert improved[0].end == pytest.approx(1.9)
    assert any(item["reason"] == "missing_from_existing" for item in review)


def test_align_and_improve_flags_large_text_mismatch_for_review():
    existing = [Cue(index=1, start=0.0, end=2.0, text="Ese pata está loco.")]
    whisper_segments = [Cue(index=1, start=0.0, end=2.0, text="Ese pago está roto.")]

    improved, review = align_and_improve(existing, whisper_segments, similarity_threshold=0.8)

    assert improved[0].text == "Ese pago está roto."
    assert any(item["reason"] == "low_similarity" for item in review)


def test_align_and_improve_splits_multispeaker_existing_lines_using_whisper_pauses():
    existing = [Cue(index=1, start=0.0, end=3.0, text="Hola. ¿Cómo estás?")]
    whisper_segments = [
        Cue(index=1, start=0.0, end=0.6, text="Hola."),
        Cue(index=2, start=1.4, end=2.4, text="¿Cómo estás?"),
    ]

    improved, review = align_and_improve(existing, whisper_segments, similarity_threshold=0.3)

    assert [cue.text for cue in improved] == ["Hola.", "¿Cómo estás?"]
    assert any(item["reason"] == "split_existing_cue" for item in review)


def test_align_and_improve_inserts_extra_whisper_lines_inside_existing_coverage():
    existing = [
        Cue(index=1, start=0.0, end=1.0, text="Estoy..."),
        Cue(index=2, start=1.0, end=4.0, text="O de lo contrario va a ser peor para usted."),
        Cue(index=3, start=4.0, end=5.2, text="Me quieren."),
    ]
    whisper_segments = [
        Cue(index=1, start=0.0, end=0.5, text="Estoy..."),
        Cue(index=2, start=0.7, end=1.5, text="Va a tener que venir, capitán."),
        Cue(index=3, start=1.6, end=2.7, text="O de lo contrario va a ser peor para usted."),
        Cue(index=4, start=2.9, end=3.2, text="¿Qué pasa?"),
        Cue(index=5, start=3.3, end=3.9, text="Lo esperamos afuera."),
        Cue(index=6, start=4.1, end=4.7, text="Me quieren."),
    ]

    improved, review = align_and_improve(existing, whisper_segments, similarity_threshold=0.55)

    assert [cue.text for cue in improved] == [
        "Estoy...",
        "Va a tener que venir, capitán.",
        "O de lo contrario va a ser peor para usted.",
        "¿Qué pasa?",
        "Lo esperamos afuera.",
        "Me quieren.",
    ]
    assert sum(1 for item in review if item["reason"] == "missing_from_existing") >= 3



def test_chunk_ranges_cover_duration_with_small_overlap():
    assert chunk_ranges(25.0, chunk_seconds=10.0, overlap_seconds=1.0) == [
        (0.0, 10.0),
        (9.0, 19.0),
        (18.0, 25.0),
    ]



def test_merge_whisper_json_chunks_offsets_segments_and_words(tmp_path: Path):
    chunk_a = tmp_path / "a.json"
    chunk_b = tmp_path / "b.json"
    chunk_a.write_text(
        '{"text":"hola","segments":[{"id":0,"start":0.5,"end":1.0,"text":"hola","words":[{"word":"hola","start":0.5,"end":1.0}]}]}',
        encoding="utf-8",
    )
    chunk_b.write_text(
        '{"text":"chau","segments":[{"id":0,"start":0.25,"end":0.75,"text":"chau","words":[{"word":"chau","start":0.25,"end":0.75}]}]}',
        encoding="utf-8",
    )

    merged = merge_whisper_json_chunks([(chunk_a, 0.0), (chunk_b, 10.0)])

    assert merged["text"] == "hola chau"
    assert [segment["id"] for segment in merged["segments"]] == [0, 1]
    assert merged["segments"][1]["start"] == pytest.approx(10.25)
    assert merged["segments"][1]["end"] == pytest.approx(10.75)
    assert merged["segments"][1]["words"][0]["start"] == pytest.approx(10.25)



def test_cleanup_cues_drops_zero_duration_and_leading_punctuation_noise():
    cues = [
        Cue(index=1, start=1.0, end=1.0, text="Y le quito."),
        Cue(index=2, start=2.0, end=2.8, text=". sigue durante la colonia."),
        Cue(index=3, start=3.0, end=4.2, text="   Sendero luminoso.   "),
    ]

    cleaned = cleanup_cues(cues)

    assert len(cleaned) == 2
    assert cleaned[0].text == "Sigue durante la colonia."
    assert cleaned[1].text == "Sendero luminoso."


def test_dedupe_adjacent_cues_collapses_identical_and_near_identical_repeats():
    cues = [
        Cue(index=1, start=0.0, end=0.8, text="No."),
        Cue(index=2, start=0.82, end=1.4, text="No."),
        Cue(index=3, start=1.5, end=2.2, text="¿Marina?"),
        Cue(index=4, start=2.23, end=2.9, text="Marina?"),
        Cue(index=5, start=3.2, end=4.2, text="Vamos."),
    ]

    deduped = dedupe_adjacent_cues(cues)

    assert [cue.text for cue in deduped] == ["No.", "¿Marina?", "Vamos."]
    assert deduped[0].start == pytest.approx(0.0)
    assert deduped[0].end == pytest.approx(1.4)
    assert deduped[1].start == pytest.approx(1.5)
    assert deduped[1].end == pytest.approx(2.9)


def test_resplit_oversized_cues_breaks_large_blocks_into_readable_chunks():
    cue = Cue(
        index=1,
        start=0.0,
        end=6.0,
        text=(
            "Hasta que eso es contra latura. ¿Y sabes por qué? Porque ninguna hembra "
            "es lo suficientemente buena como para competir con todas las otras. No toda la vida."
        ),
    )
    split = resplit_oversized_cues([cue], max_chars=84, max_lines=3)

    assert len(split) >= 2
    assert all(len(item.text) <= 84 for item in split)
    assert all(item.text.count("\n") + 1 <= 3 for item in split)
    assert split[0].start == pytest.approx(0.0)
    assert split[-1].end == pytest.approx(6.0)



def test_finalize_cues_caps_unreasonably_long_short_text_durations():
    cues = [
        Cue(index=1, start=0.0, end=30.0, text="No."),
        Cue(index=2, start=31.0, end=33.0, text="Sigue."),
    ]
    final = finalize_cues(cues)
    assert final[0].end - final[0].start < 6.0
    assert final[0].end <= final[1].start



def test_review_csv_writer_output(tmp_path: Path):
    from subtitle_workflow import write_review_csv

    rows = [{"reason": "low_similarity", "start": 1.25, "end": 2.0, "text": "foo", "source_text": "bar"}]
    path = tmp_path / "review.csv"
    write_review_csv(rows, path)
    content = path.read_text()
    assert "reason,start,end,text,source_text" in content
    assert "low_similarity" in content


def test_build_parser_defaults_to_auto_language_and_accepts_short_flag():
    parser = build_parser()
    args = parser.parse_args(["movie.mkv", "draft.srt", "-l", "fr", "--speaker-mode", "pyannote", "--speaker-labels"])
    assert args.language == "fr"
    assert args.speaker_mode == "pyannote"
    assert args.speaker_labels is True

    default_args = parser.parse_args(["movie.mkv", "draft.srt"])
    assert default_args.language == "auto"
    assert default_args.speaker_mode == "none"
    assert default_args.speaker_labels is False


def test_apply_speaker_turns_splits_multispeaker_cue_and_assigns_labels():
    cues = [Cue(index=1, start=0.0, end=4.0, text="Hola. ¿Cómo estás?"), Cue(index=2, start=4.4, end=5.2, text="Bien.")]
    speaker_turns = [
        SpeakerTurn(start=0.0, end=1.8, speaker="SPEAKER_00"),
        SpeakerTurn(start=1.8, end=4.1, speaker="SPEAKER_01"),
        SpeakerTurn(start=4.3, end=5.3, speaker="SPEAKER_01"),
    ]

    split = apply_speaker_turns(cues, speaker_turns)

    assert [cue.text for cue in split] == ["Hola.", "¿Cómo estás?", "Bien."]
    assert [cue.speaker for cue in split] == ["SPEAKER_00", "SPEAKER_01", "SPEAKER_01"]
    assert split[0].end <= split[1].start


def test_render_text_prefixes_speaker_labels_when_requested():
    cue = Cue(index=1, start=0.0, end=1.0, text="No demore.", speaker="SPEAKER_02")
    assert render_text(cue, speaker_labels=False) == "No demore."
    assert render_text(cue, speaker_labels=True) == "[SPEAKER_02] No demore."


def test_parse_rttm_reads_speaker_turns(tmp_path: Path):
    rttm = tmp_path / "sample.rttm"
    rttm.write_text(
        "SPEAKER sample 1 0.000 1.250 <NA> <NA> SPEAKER_00 <NA> <NA>\n"
        "SPEAKER sample 1 1.250 0.750 <NA> <NA> SPEAKER_01 <NA> <NA>\n",
        encoding="utf-8",
    )

    turns = parse_rttm(rttm)

    assert turns == [
        SpeakerTurn(start=0.0, end=1.25, speaker="SPEAKER_00"),
        SpeakerTurn(start=1.25, end=2.0, speaker="SPEAKER_01"),
    ]
