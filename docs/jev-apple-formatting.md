# Jev evaluation and Apple formatting

Auto Subtitle 1.0.1 shares one bounded Apple formatting implementation between the app and developer evaluations. Jev remains development-only. The reference was the published [CutNotes 1.0.5](https://github.com/aindaco1/cutnotes/releases/tag/v1.0.5): bounded local transformations, explicit incomplete/fallback reporting, exact preservation gates and review of representative output. Its transcript-specific formatting code was not copied.

## 1.0.2 candidate evidence — September 23, 2026

The release comparison preserves all original questions and the 0.10 margin. Six
new public cases cover English/Spanish caption continuations, questions, uncertainty
and negation. Eight fresh labeled calibration examples extend the fixed controls:
36/36 gave confident correct decisions with `jev-1.13.0`.

The existing-source native baseline preserved all 13 cases and completed its
requests; live Jev returned 11 passes and two phrase-boundary reviews. The current
candidate preserves all 19 cases, joins the two language-specific conditional
sentences correctly across caption boundaries, and retains already usable captions
without a surface request. One Spanish proposal substitutes a synonym; the lexical
gate rejects it and preserves the original caption. Native completion therefore
remains incomplete, not a combined pass.

Live Jev on that saved candidate returned 17 passes, one English phrase review,
and one erroneous continuation finding. The finding says the first caption ends
in a period, but the actual output is `If Ana comes,` followed by
`we can leave together.` in the second caption. The separate conditional-meaning
question passes. This is an inspected judge error; the original report and its
nonzero exit status remain intact. No threshold or question was changed to hide it.

The development corpus is small and has been inspected during iteration. It is
regression evidence, not independent human acceptance or a recognition-accuracy
measurement. Native fallback, semantic judgment, source/unit gates, and public
release acceptance remain separate results.

Evidence: ignored `artifacts/evaluation/release-1.0.2-baseline[-jev-auth]`,
`release-1.0.2-calibration`, `release-1.0.2-candidate-v5[-jev]` and
`release-1.0.2-audio`. Earlier context and structured-output experiments are retained
as failed evidence; they are not the release implementation. Public synthetic
fixtures alone went to Jev. Private cached transcription was checked locally for
numeric/timing compatibility without sending its content.

## Product behavior

The app still supports macOS 15+. With cleanup enabled, an available Apple Intelligence model on macOS 26+ can improve English/Spanish line breaks, including translated subtitles. NaturalLanguage identifies the subtitle language independently of audio. It protects recognized names and grammatical units before selection. An already-safe top-scored break is retained without inference; otherwise the model chooses among bounded source-derived strings. Reconstruction uses those exact strings, never model-authored words or timestamps.

Punctuation and capitalization are polished with cleanup when needed. Already capitalized, sentence-terminated captions retain their surface. At most three compatible continuous captions (500 characters) share a source-preserving punctuation request, then return to their original word boundaries and timing. Existing punctuation is retained at the same word boundary. It preserves ordered words, accents, quantities, internal apostrophes/hyphens and protected symbols. It rejects added/deleted words, translation, numeric changes and control characters. Punctuation can change meaning, so changes are recorded in the Local report and the app requests review before Save. Protected ASS/karaoke, speaker turns and lyrics bypass inference. Unsupported or uncertain languages, unavailable models, invalid responses and timeouts retain standard output with a notice. Cleanup off skips Apple entirely.

Audio-supported spelling changes remain exclusively in Improve's existing acoustic, timing, language, confidence and dictionary gates. This release does not introduce another ASR pass, translation, cross-cue regrouping or invented word timing.

The native helper starts a fresh bounded session per model request and uses greedy generation. Batches contain at most eight requests with a 60-second bound and cancellation. Completed responses are cached in existing private job storage, keyed by source/options, helper hash, OS and available model metadata and validated with a content hash. These are retry caches; an Apple model revision can change independently of OS version.

## Evidence and limits — September 23, 2026

| Check | Result |
|---|---|
| Exact source/timing/format checks | 13/13 synthetic cases preserved |
| Jev calibration | 28/28 labeled examples, including eight fresh validation examples |
| Deterministic baseline, frozen Jev policy | 10/13 case passes; two punctuation failures, one Spanish layout review |
| Initial Apple prototype | 12/13 passes; a bad Spanish phrase break remained |
| Final integrated helper (`release-layout-v7`) | 12/13 Jev passes, one English phrase review, no semantic failures; native requests complete |
| Product transport | Availability, malformed response, cache binding, cancellation, cleanup-off and protected presentation tests |

The targeted corpus isolates layout for most cases and surface edits for its two punctuation cases; the twelve-cue production smoke in validation exercises automatic punctuation on all eligible captions. The final reviewed examples keep “old station”, “estación central”, “después del último tren” and “Dr. Ana Ruiz” together, and produce “We should wait here until María arrives.” and “Si no viene Ana, nos quedamos aquí.” The unresolved Jev item has a 0.09 probability margin, below the fixed 0.10 threshold, for a break before “after the last train.” It remains review; the command exits nonzero. An intermediate run also falsely marked the complete name on a single line as split. These failures remain recorded and demonstrate why this judge is advisory.

The corpus was used during development and is small: it establishes a bounded improvement in these examples, not accuracy across films. Native tests used AFM 3 Core with a 4,096-token context on Apple Silicon/macOS 27. Layout model calls were roughly one second on this host; punctuation adds more work. This is a quality improvement, not a speed improvement. Keeping safe breaks and caching results reduces repeat work. Full-film latency, clean minimum-memory hardware, actual macOS 26 inference and external bilingual human acceptance remain unmeasured. No private media or transcripts were sent remotely.

## Run it

Initialize the exact submodules with `git submodule update --init --recursive`. Evaluation uses Node 22+, Xcode 26+ for native compilation, and an available Apple model for inference.

```sh
npm test
npm run test:quality                     # offline corpus and Jev preview
npm run test:apple                       # local native output and offline preview
npm run test:jev:calibrate               # explicitly live public calibration
npm run test:jev                         # explicitly live baseline evaluation
npm run test:apple -- --live              # fresh native output then live Jev
node scripts/check-formatting.mjs --evidence artifacts/evaluation/RUN/report.json --live
```

Live commands require `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Alternatively set the account ID and add `--wrangler-auth` to reuse already-installed Wrangler 4.136.2 authentication via `npx --no-install`; the tool performs no installation or login and writes no credentials. Options include `--output DIR` (new directory), `--policy FILE` (committed default) and `--max-questions N` (1–100). No automatic retries or top-ups occur. Offline completion, missing/unknown model versions, stale calibration, provider errors and near ties cannot become a combined pass. `releaseAccepted` always remains false: release validation is separate.

## Ownership and privacy

- `engine/quality.mjs` scores source-derived layout candidates and owns deterministic cleanup.
- `engine/formatting-policy.mjs` is the common production/evaluation preservation gate.
- `engine/apple-formatting.mjs` owns local production transport and private caches.
- `formatting-sidecar/AppleSubtitleFormatter.swift` is the shared native helper.
- `scripts/check-formatting.mjs` and `scripts/lib/subtitle-evaluation.mjs` own public corpus validation, calibration and evidence.
- `@dustwave/test-core/jev` owns shared request construction, bounded Cloudflare transport, response validation and probability-margin decisions.

Platform is pinned to `0affb6c5652611b87947bd87762d8aa17d35ea32` containing Test Core 0.3.0 from [PR #46](https://github.com/aindaco1/dust-wave-platform/pull/46). The timed-text tree is byte-identical to the earlier `6da7db044f668a481d4bac2e5c2c8d78d17a3d2d` pin; The former Record dependency is replaced by Platform’s native package; FluidAudio stays exactly 0.15.5. No shared source or duplicate Jev client was introduced. Packaging copies the app engine/native helper and timed-text, excluding scripts, fixtures and Test Core.

The full allowlisted synthetic corpus is checked before credential access or any remote request. Arbitrary subtitle paths are not accepted. The policy binds fixture, calibration, request-protocol hashes and `jev-1.13.0`. The original 20 calibration examples exposed three false passes for bad line boundaries. Explicit CAPTION/LINE labels replaced raw newline framing, the original validation cases became regressions, and eight fresh validation cases were added. Calibration proposes a policy only after all labels pass; it never silently modifies the committed policy. Provider logging/cache headers are disabled, without claiming they establish a retention guarantee.

Apple documents [availability and context limits](https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models) and [permissive text transformations](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/guardrails/permissivecontenttransformations). Plain string punctuation generation uses that guardrail mode; guided layout still has ordinary guardrails. Rejections preserve standard output. Jev follows TypeSafe's [atomic question](https://docs.typesafe.ai/introduction) and [uncertainty](https://docs.typesafe.ai/confidence) guidance through the [Cloudflare API](https://developers.cloudflare.com/ai/models/typesafe/jev/).

Ignored local evidence is retained under `artifacts/evaluation/`: initial baseline/native runs, `jev-calibration-initial`, `jev-calibration-lines-v2`, `baseline-jev`, `apple-surface-v2[-jev]` and `release-layout-v3` through `v7` with corresponding live evidence. These include requests, raw responses, output subtitles, helper snapshots, environment hashes and readable reviews. Integrated bundle/GUI/release evidence is recorded separately in [validation](validation.md).
