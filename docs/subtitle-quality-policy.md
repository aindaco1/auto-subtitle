# Subtitle formatting and cleanup policy

Research checked September 7, 2026. Planned policy: `subtitle-quality-v1`. This document owns subtitle readability, cleanup, and format-validation rules for the [implementation plan](implementation-plan.md). The rules are not implemented yet.

**Scope and defaults**

Every Align, Generate, and Improve export uses one shared quality pass. **Clean up formatting** defaults on for imported subtitles, including translations, and can be turned off under Options for exact cue/text-layout preservation. Generate always uses the quality policy. This is independent of **Improve accuracy**, which authorizes same-language wording corrections. Cleanup can rewrap text, split supported long cues, and consolidate redundant identical captions without translating or paraphrasing.

This refines the earlier strict preservation plan: with cleanup on, line breaks and cue boundaries may change, and duplicate display events may become one. Preserve lexical content and language, aside from documented duplicate consolidation; preserve original input and record source-to-output cue lineage. With cleanup off, Align changes timing fields only. Keep raw document preservation separate from the normalized comparison text.

**Research basis**

| Primary source | Relevant guidance and application |
|---|---|
| [Netflix general requirements](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements) | Recommends at most two lines, grammatical line divisions, and event durations from five-sixths of a second to seven seconds. Use these as readability defaults with documented exceptions. |
| [TED subtitling tips](https://www.ted.com/participate/translate/subtitling-tips) | Uses 42-character lines, two-line captions, balanced phrase-aware wrapping, and a 21-characters-per-second limit. This supports the layout direction; our language profiles below use their own reading-speed thresholds. |
| [DCMP Captioning Key](https://dcmp.org/captioningkey/print) | Prioritizes readable timing and meaning, and keeps grammatical units and names together at line breaks. Preserve speaker identification and meaningful sound information. |
| [Netflix English guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide) and [Spanish guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217349997-Spanish-Latin-America-Spain-Timed-Text-Style-Guide) | Reading-speed limits differ: adult English 20 CPS, adult Spanish 17 CPS. Children’s limits are 17 and 13 respectively. Follow the subtitle language, which may differ from the audio. |
| [Netflix timing guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines) | Uses two-frame gaps and considers audio and shot boundaries when adjusting display times. Keep display adjustments separate from acoustic alignment evidence. |
| [Library of Congress SRT description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml) | Describes numbered timestamp blocks, text, blank-line separators, and encoding variability. Use this for interoperable serialization; readability targets are separate from parser validity. |

These sources describe different delivery contexts. The policy below is this app's implementation choice, not a claim of Netflix delivery certification or a universal SRT specification. External editorial rules do not authorize deleting dialogue, changing translations, adding credits, or applying a service-specific delivery format.

**Layout, duration, and reading speed**

| Rule | App behavior |
|---|---|
| Long lines | Prefer one line when it fits; otherwise use at most two lines. Start English/Spanish and other validated Latin-script profiles at 42 visible characters per line. Prefer clause/punctuation boundaries; keep names, numbers with units, and grammatical groups together. Linguistic coherence outranks perfectly equal line lengths. |
| More than two lines of text | Split into successive cues at sentence/clause and supported timing boundaries. Generated or recognized same-language text uses observed word timings. Imported text uses trusted authored/aligned phrase boundaries. A translated phrase cannot inherit source-language word timing merely by position. |
| Unsupported subdivision | Rewrap within the existing display interval where possible. If a long cue cannot be safely subdivided, retain all its content and report the unresolved readability problem. Never distribute time by character count and call it acoustic alignment. Use such cases to improve the benchmark before claiming complete cleanup coverage. |
| Reading speed | Calculate visible characters divided by display duration: English adult warning above 20 CPS; Spanish adult above 17 CPS. Keep audience/language profiles in the shared policy rather than adding numeric controls to the main window. Unknown Latin-script languages use an explicitly provisional 17-CPS advisory. |
| Duration | Aim for roughly 0.833–7 seconds for ordinary dialogue cues. A short word may need an exception when faithful timing leaves no reading room. Never drop it solely for being short. Keep continuous duplicate holds intact even when longer than seven seconds, with a recorded exception. |
| Display-time adjustment | When supported by available audio/timeline evidence, extend a short cue into spare reading time, bounded by the next cue, meaningful silence, and known scene/speaker boundaries. Start with a maximum 500 ms extension as an app policy to benchmark. Never shift later dialogue to create reading space. |
| Gaps and overlap | For newly segmented plain dialogue, aim for a two-frame gap at a reliable constant frame rate; otherwise use an explicit 80 ms display-gap policy. Do not introduce overlaps or negative durations to meet that target, and preserve intentional ASS layers/overlaps. This is display policy, not a claim that SRT is frame-indexed. |
| Other scripts | Use Unicode grapheme boundaries and language-aware word/line segmentation. Keep combining sequences, emoji, and right-to-left text intact. CJK and other unvalidated scripts need appropriate width and speed profiles; do not force Latin word splitting or advertise a Latin CPS threshold as validated for them. |

Count visible text with spaces and punctuation, excluding markup and line-break control codes. Treat an inserted soft wrap as the same word separator for CPS so wrapping alone cannot improve the metric. Render-width checks supplement character counts for ASS; SRT's final width also depends on the player's font and window. Preserve language-specific punctuation, accents, hard dialogue-speaker breaks, SDH labels, and meaningful formatting. Do not add ellipses merely because a sentence continues in another cue.

Splitting the same words across more cues in the same total time does **not** solve excessive reading speed. Prefer supported display-time adjustments or better phrase grouping; if that is insufficient, keep the words and report it. Version 1 does not silently summarize text to satisfy a numerical threshold.

**Consolidating repeated captions**

The user's requested behavior is to turn a redundant run of identical captions into one display event spanning its full coverage. Example authored for this policy:

| Input events | Output event |
|---|---|
| 10–12 s: “Wait outside.”; 12–14 s: “Wait outside.”; 14–16 s: “Wait outside.” | 10–16 s: “Wait outside.” |

Use these conditions together:

1. Visible text is identical after comparison-only Unicode normalization and soft-wrap/whitespace normalization. Preserve case, punctuation, negation, numbers, speaker markers, and emphasis in the comparison. Do not use fuzzy similarity to erase nearly identical sentences.
2. Events overlap or touch and have compatible presentation properties: style, layer, position, and any explicit speaker identity. A gap up to 100 ms is a provisional tolerance only when continuity is supported; do not bridge an actual silence or unrelated intervening cue. Compare consecutive events within the same presentation lane.
3. The run represents a redundant continuous display or duplicate observation, not an exchange, a new scene, separately timed lyric beats, or repetitions whose separation conveys meaning. Preserve intentional text such as “No, no, no!” within a cue. Do not merge ambiguous short replies merely because the words match; shared recognition provenance can establish duplicates without a new model pass.
4. Merge using the earliest start and latest end of the eligible run, keeping one original payload and complete source-cue lineage. Do not truncate its coverage at a nominal duration limit, then split it back into repeated copies. Record a long-hold exception when needed. Check known animation/karaoke tags before changing event duration; skip unsafe merges.

This is a conservative app rule informed by the user's requirement. Some subtitle-template guidance condenses repeated speech; the app does not automatically apply those broader editorial deletions. [Netflix subtitle templates](https://partnerhelp.netflixstudios.com/hc/en-us/articles/219375728-Timed-Text-Style-Guide-Subtitle-Templates).

Overlapping repeated observations from ASR chunk joins should be removed using source-audio/word identity before caption layout. Imported repeated events follow the rules above. Repeated lines *within* one cue are deduplicated only when formatting/provenance establishes a copy artifact; do not collapse a two-speaker exchange or intentional emphasis. These cases must share comparison and lineage helpers rather than independent fuzzy heuristics.

**Format validation and implementation ownership**

Place the policy, Unicode comparison, grouping, duplicate decisions, and quality reports in `@dustwave/timed-text`, extending `word-grouping.js`, `presentation.js`, and the appropriate dialogue helpers through a new policy/export. Existing presentation code contains English-specific function words and different duration/length settings; preserve other consumers' defaults and add subtitle-language profiles. Swift and the CLI consume the same result. Do not copy the current Python `dedupe_adjacent_cues()` thresholds of 0.9 similarity and a 2.5-second gap; they are too broad for this preservation contract. Do not reuse `resplit_oversized_cues()`'s character-weighted timing as an accurate subdivision algorithm.

The pass order is: align/recognize → consolidate supported duplicate observations/events → choose cue divisions → choose line breaks → apply supported display-time adjustments → serialize → validate. Preserve acoustic timing separately from display timing. Make the pass deterministic and idempotent: processing its output again must not keep merging, splitting, or moving cues. In speech-activity matching, use the union of covered intervals so duplicates do not overweight the reference.

New/restructured SRT output uses sequential numeric indices, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, consistent line endings, a blank line between blocks, UTF-8, and a final newline. Validate parse/serialize/parse equivalence, finite nonnegative times, start before end, media bounds, stable chronological ordering, no malformed/empty exported cues, and preserved text. Existing deliberate overlaps are not automatically errors. Long text is a readability issue, not grounds to reject an otherwise parseable input. Report unsupported encoding instead of substituting replacement characters.

For ASS, preserve sections, styles, comments, explicit line breaks, layers, margins, and override tags. Change wrapping only where its meaning and inline styling remain representable. Keep specially positioned, animated, or karaoke events unchanged when the transformation would be unsafe. Apply metrics to visible text, never count tags as words, and do not normalize bidirectional text through a generic sanitizer that deletes legitimate direction controls.

**Required acceptance cases**

| Fixture | Required outcome |
|---|---|
| Long single line; sentences exceeding two lines | Grammatical wrapping; successive readable cues when timing anchors exist; all lexical content retained. No orphaned name/unit or fabricated precise timing. |
| Adjacent exact duplicate run, including a run over seven seconds | One cue from first start to last end, no content/style loss, no oscillation on rerun. |
| “I can go.” versus “I can't go.”; different names/numbers/punctuation | No fuzzy merge. |
| Identical replies by different speakers, repeats after silence, lyrics, layered ASS | Distinct events preserved unless duplication is established. |
| Spanish audio with English subtitles; Unicode subtitles outside Parakeet's languages | Same cleanup service, original language preserved, no recognition requirement for wrapping/eligible merging. Uncertain translated cue splits are reported. |
| Too-fast cue with no spare time | Readability warning, no deleted words, no false claim that rewrapping fixed CPS. |
| Short dialogue; malformed timing; rounding near cue boundaries | Short speech preserved, invalid output blocked, no newly introduced zero/negative duration or accidental overlap. |
| ASS overrides/karaoke, combining marks, emoji, RTL, escaped formatting | Content and supported styling survive; unsafe transformations skipped and explained. |
| Cleanup disabled; repeated processing | Timing-only preservation when disabled; idempotent cleanup when enabled. |

Gate the first alignment MVP on safe rewrapping and duplicate consolidation, including translated inputs. Add acoustic subdivision tests with Generate/Improve and the detailed alignment path. Log counts and reasons for rewrapped, split, merged, retained, and unresolved cues; the UI needs only a short summary and optional report. Compare timing accuracy both before and after display cleanup, and validate rendered SRT/ASS samples in a player because structural checks cannot prove readability.

A read-only screening of the supplied SRT found 378 cues with a line longer than 42 characters, five with more than 84 normalized visible code points, 374 shorter than five-sixths of a second, and 878 above 17 code points per second. These are screening counts, not human readability judgments or the final grapheme-based metric. No adjacent exact-repeat pairs met the 100 ms candidate gap; use synthetic and additional real fixtures for duplicate acceptance. Source files were not changed.
