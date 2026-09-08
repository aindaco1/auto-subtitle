# Spanish recognition emitting English words

Investigated September 7, 2026 after review of the native Generate export. Original investigation: reproduced and isolated in 0.3.0. The authorized 0.3.1 implementation follow-up below adds selective repair; full human accuracy acceptance remains open.

## Original 0.3.0 findings

The 874-cue native SRT is byte-identical to the earlier generated SRT. English words already appear in the saved Parakeet recognition chunks, before cue grouping or SRT serialization. Repeating the original 178–242 second audio window reproduces the mixed-language passage. Timing-only alignment is independent of this recognition path.

A deliberately limited English-word scan flags 70 cues. Apple's text language recognizer independently assigns English a score of at least 0.8 in 40 cues. These sets overlap; they are review candidates, not a count of verified errors or a word-error rate. Short names, interjections, genuine language switches and shared vocabulary require review.

The app's existing overall check assigns Spanish a score of **0.999054**. `identify()` sends the transcript to the speech helper, which examines its first 32,000 characters. That dominant-text-language result cannot validate every passage or independently identify the language spoken in the audio. `runJob()` has no segment-level language check. Its manual language choice does not condition recognition, and Generate follows the recognized dominant language even when a manual selection differs. Verified checkpoints preserve the faulty text on retry; their hashes establish integrity, not accuracy.

## Reproduction and bounded experiments

Used the existing verified model and FluidAudio 0.15.5 (`19600a485baa4998812e4654b70d2bab8f2c9949`). Extracted 16 kHz mono PCM from the same selected Spanish track. Completed 22 local recognitions: eight original-speed windows, the same eight through FluidAudio's Spanish hint, and six pitch-preserving slower-audio trials. Compared their output with each other and the supplied rough SRT. No independent human listening/ground-truth annotation or full-film WER measurement was performed.

| Test | Observation | Conclusion |
|---|---|---|
| Original 178–242 s window | Reproduces English intrusion near 3:39 | Fault exists before subtitle formatting; cache/export is not the origin |
| Shorter windows around 3:39 and 12:29 | Mostly recover Spanish; some spelling/foreign fragments remain | Context affects the result, but shortening alone is not a validated general repair |
| 538–566 s window | Substantial English remains | Another failure site survives a shorter context |
| `language: .spanish` on the same eight windows | Four differ, four remain identical; English persists and new errors appear in affected passages | Do not wire this hint into the app as a presumed Spanish lock |
| Pitch-preserving 0.6× and 0.8× on three windows | 0.6× recovers Spanish in the first long window, still fails around 9:00; 0.8× introduces English into the previously Spanish 738–766 s control | Do not ship blanket slowdown or choose a retry merely because it contains fewer English words |

Private inputs, exact outputs, clip/hint probe source, per-cue scores and comparisons remain in ignored `artifacts/testing/language-investigation/`. `review.md` and `audit.json` contain subtitle text and must not be submitted through diagnostics or committed. Original media, supplied SRT, native export and installed app were not modified.

## Upstream evidence

[FluidAudio #842](https://github.com/FluidInference/FluidAudio/issues/842) documents the same symptom on conversational Spanish and corrects its original diagnosis: the reporter reproduced it in upstream Parakeet as well, attributing it to model behavior rather than a Core ML conversion defect or a translation stage. Our reproduction is consistent with that report; we did not repeat its upstream fp32 comparison.

The pinned FluidAudio decoder has a language hint that filters scripts and applies an English token blocklist. It is not native language conditioning in Parakeet. [FluidAudio #840](https://github.com/FluidInference/FluidAudio/issues/840) reports damage from that blocklist across other languages and code-switching. The local Spanish-hint experiments above also fail to establish a safe repair. Updating a language label or suppressing English tokens is therefore insufficient.

## Proposed steps from the original investigation (subsequently implemented)

1. Add bounded segment-level language auditing to Generate and to recognition used by Improve. Preserve the dominant-language result as metadata, while separately reporting suspicious language changes with timestamps. Use text-language scores as suspicion evidence; short text and legitimate mixed-language speech must not trigger unconditional rewriting. Surface unresolved cases in the existing result summary and private report.
2. Benchmark a local recognizer with actual language conditioning on the failing passages, neighboring correct passages, genuine Spanish/English speech, names, negation, silence and other supported languages. The previously deferred [whisper.cpp](https://github.com/ggml-org/whisper.cpp) backend is a candidate for this evaluation, not an adopted dependency or a verified fix. Reuse the speech/result and verified model-management contracts if it passes; avoid a separate subtitle pipeline.
3. Keep Parakeet first. Retry only suspicious audio intervals with enough context, and accept replacements only with evidence of correct speech coverage and timing. Preserve intentional language changes. Retain original recognition and a local change audit; leave unresolved passages visible rather than translating or deleting their text to satisfy a language score.
4. Include recognizer, model revision, effective language and retry-policy version in recognition cache identity. Do not disturb validated activity/timing caches. Bind remapped word times to source audio and test interval seams; preserve imported cue timing and ASS presentation when only wording changes.
5. Add regressions for a Spanish-dominant transcript containing English passages, short ambiguous cues, genuine code-switching, dictionary/name/polarity protection, cancellation/resume and stale-cache rejection. Run full-film comparison and bilingual review before treating generation as accepted. A lower English-marker count alone is not an accuracy gate.

## Implemented follow-up

The user subsequently authorized proceeding. Version 0.3.1 adds passage-level language checking, optional verified local Whisper retries, independent automatic audio-language identification, a second decode with different context, strict wording/coverage/confidence agreement, and protection for possible names and Spanish polarity terms. It preserves original generated cue times and retains uncertain text with timestamped review reasons. Improve excludes suspicious ASR intervals. Timing-only translated alignment remains independent.

Whisper uses acoustic DTW anchors because its legacy token start/end fields were sometimes zero or inverted during testing. Existing compatible MacWhisper weights were reused after exact publisher hash/size verification. The primary Parakeet checkpoints remain unchanged; only suspicious windows require fallback recognition, and fallback receipts bind the runtime/model/language/context/policy.

The [validation record](../validation.md) gives the final installed-engine full-film counts, unchanged timing evidence and control results. Neither two-pass agreement nor fewer English markers proves correct wording: unresolved passages and human bilingual review remain explicit. Original media and subtitle exports are preserved; the reviewed candidate is saved separately. Private text, audio, per-cue scores and reports remain local and are excluded from diagnostics.
