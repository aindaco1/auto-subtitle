# Architecture

SwiftUI owns one window, file panels, progress, cancellation, and the diagnostics preview. Every operation calls the same bundled Node engine with structured JSON. The Python CLI is an adapter to that engine, not a second implementation.

The native update controller delegates feed retrieval, Ed25519 archive verification, replacement and relaunch to pinned Sparkle. Its shared busy state blocks checks during processing, model setup and report delivery, and postpones accepted installation until those operations finish. File import/export share a sheet presenter attached to the active window or nested diagnostics/model sheet.

| Authority | Responsibility |
|---|---|
| `engine/job.mjs` | Request validation, media identity, selected audio track, job lock, cache, modes, private audit |
| `engine/subtitles.mjs` | SRT/ASS import/export, stable cue identity, source presentation, quantized timing validation |
| `engine/sync.py` | ffsubsync FFT correlation, WebRTC speech activity, independent sampled validation, conservative supported pieces |
| `engine/recognition.mjs` | Overlapping audio chunks, verified checkpoints, language checks, conservative wording changes and second-pass agreement |
| `engine/language-guard.mjs` | Passage language audit, selective repair acceptance, unresolved review and name/polarity guards |
| `engine/whisper.mjs` | Optional local Whisper discovery, bounded audio retries, acoustic token anchors and verified retry caches |
| `engine/quality.mjs` | Deterministic wrapping, duplicate consolidation and readability policy |
| `engine/formatting-policy.mjs` | Shared app/evaluator candidate and word-preservation checks |
| `engine/apple-formatting.mjs` | Local helper transport, availability, bounded batches, cancellation and verified job caches |
| `formatting-sidecar/AppleSubtitleFormatter.swift` | NaturalLanguage phrase boundaries and optional Foundation Models selection/surface edits |
| `shared/dust-wave-platform/packages/timed-text` | Direct word grouping and recognition-confidence dependency; platform pinned at `816da7b52ed346025f5bbe3a7a420e9ad7c4a815`; timed-text files unchanged from the previous pin |
| `shared/record/Sources/RecordSpeech` | Direct Swift dependency for Parakeet and model verification; pinned at `8897446b348271d5d548278fa6f6a91053d9bd6d` |
| `speech-sidecar` | Narrow RecordSpeech bridge without mandatory diarization; manifest generation and local NaturalLanguage identification |
| `engine/models.mjs` | App-specific discovery and verified atomic installation; Parakeet manifest generated from Record, pinned Whisper inventory |
| `resources/parakeet-capabilities.json` | Recognition language inventory shared by Swift and Node |
| `engine/diagnostics-contract.mjs` | Allowlisted public report schema and canonical fingerprint shared with the existing relay |

Podcast Visualizer supplied the verified runtime, palette, model/process design, chunking and confidence lessons. Its app-private downloader and editor were not imported: they couple UI/session/storage dependencies the subtitle app does not need. Auto Subtitle's narrow installer shares Record's exact model authority and has hostile-path, redirect, hash, cancellation and reuse tests. No runtime import reaches into a sibling checkout.

Alignment uses eight 45-second speech windows first. The same decoded reference is reused across offset/rate candidates. Held-out windows must agree before a global transform is accepted. If that fails, full activity analysis and independently supported pieces can shift entire cues in supported intervals; uncertain cues retain their original timing. Lexical similarity plays no role in translated alignment. SRT timestamps are milliseconds, not frame numbers: “FPS correction” is an observed playback-rate transform, never inferred from video FPS alone.

Generate loads Parakeet once for a batch of 60-second core chunks with two seconds of context. Word ownership is based on absolute midpoint, not repeated text. Completed results receive content-hash receipts; cancelled jobs reuse verified chunks. Recognition and generated captions follow the spoken language. The app does not translate.

Generate establishes its cue boundaries before language repair, then audits whole cues and overlapping short text windows. NaturalLanguage hypotheses only flag candidates; they do not establish the audio language. A narrow Spanish English-marker check supplements the observed mixed-text failure. If enabled and a verified local Whisper model is available, only suspicious intervals are decoded: first with automatic audio-language identification, then with different context and the expected language. Existing wording corroborated by independent recognition is retained, including possible intentional code-switching. Changes require matching audio/text language, exact normalized word agreement, token confidence and coverage, bounded word-count changes and name/polarity safeguards. Uncertain candidates retain original text and appear with timestamps/reasons in the private report and a count in the result summary. These safeguards reduce risk; they are not a human accuracy measurement.

Whisper uses DTW token anchors to associate recognized words with existing cue intervals. Legacy token start/end values can be zero or inverted and are not used as alignment evidence. Language repair never changes the established cue start/end times. The optional model uses the same verified atomic installer as Parakeet; no parallel downloader or subtitle exporter exists. Whisper caches bind the audio window, selected language, pass, model revision/hash, runtime commit and retry policy to a content-hash receipt. Parakeet’s unchanged recognition cache schema remains at its existing version independently of the app release version, so adding the repair stage does not transcribe the entire film again.

Improve requires confidently matching languages and accepted timing. Suspect recognition intervals from the same language audit are excluded from spelling repairs and missing-speech recovery; timing-only alignment remains independent. A single, similar-word replacement in a phrase must meet confidence, capitalization/polarity and second-pass agreement checks. Apple's local spelling dictionary must also flag the source word and accept the replacement; valid words are preserved, and replacements are skipped if that language's dictionary is unavailable. Source punctuation and casing are preserved. This limits edits but does not establish human-measured accuracy; uncertain candidates remain untouched. The helper uses [NSSpellChecker](https://developer.apple.com/documentation/appkit/nsspellchecker) without requesting automatic replacements or grammar rewrites.

FFmpeg networking is disabled and model loading is forced offline. Child processes use argument arrays, bounded output, absolute bundled executables, and process-group cancellation. Current-state and crash diagnostics are separately projected; private change audits are never submitted by the reporting command.

Development evaluation uses `@dustwave/test-core/jev` 0.3.0 from the merged Platform PR #46 pin. `scripts/check-formatting.mjs` owns public synthetic fixtures, calibration and evidence storage. Scripts, fixture sources and Test Core are excluded from the app. The product and evaluator share the same formatting policy and Swift helper; only transport differs. Jev never runs in `runJob()`.

After deterministic cleanup, the helper identifies each subtitle's language independently of audio, protects named/grammatical units, and selects one of at most twelve source-derived layouts. It cannot generate new words or timings for layout. Punctuation edits must retain ordered words, accents, numbers and protected symbols; changes remain review material. Protected ASS, speaker turns and lyrics bypass inference. Unavailable models, unsupported languages, invalid output and timeouts retain standard output with a notice. Cleanup off skips the helper entirely. Completed responses are cached within the existing private job directory, keyed by source/options, helper hash and OS, with content-hash validation. Model revisions can vary within an OS; caches are retry aids, not cross-device reproducibility guarantees. See [evaluation and scope](jev-apple-formatting.md).
