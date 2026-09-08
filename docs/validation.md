# Validation

Recorded September 7–8, 2026 on Apple Silicon, macOS 26.6.2. Each section distinguishes local, provider and installed-artifact evidence. Clean macOS 15 and human subtitle acceptance remain separate.

## 1.0.0 release checks

- **49 Node, five Swift, 27 Python and 32 relay tests pass.** Updater policy tests cover busy-job refusal and launch checks. Diagnostic regressions cover current-state delivery, strict privacy, actual incident build metadata, crash grouping independent of the current workflow, and duplicate receipts.
- The Developer ID signed app passes strict nested signature checks, contained-runtime/import checks and a signed Node JIT smoke. Sparkle 2.9.6 uses a dedicated Ed25519 key and the official GitHub release feed. Accepted installs wait for active processing, model setup and report delivery to finish.
- Native import and Save now use sheets. The signed 1.0.0 app imported the full film, reused verified recognition checkpoints, generated 874 cues with 37 repairs, six corroborated unchanged cues and 39 unresolved advisories, and saved SRT through the native panel. The export is byte-identical to the prior language-checked output; all 874 original native timestamp pairs are retained.
- Native Help preview and JSON export passed with app 1.0.0/build 10000 and the expected workflow state. The exact preview enables reviewed submission. The exported JSON contains no media title, paths or transcript; it was not submitted.
- Authorized synthetic GitHub testing verified two distinct crashes aggregate to one issue with count two; retrying the same ID returns the same issue without incrementing its count. A synthetic current state created a separate issue. [Crash test #2](https://github.com/aindaco1/auto-subtitle/issues/2) and [state test #3](https://github.com/aindaco1/auto-subtitle/issues/3) are labeled as tests and closed. Only artificial metadata was sent.
- Relay source was validated with 32 tests and deployment dry-run, then deployed from committed source `6b08725` by [hosted run 34185767363](https://github.com/aindaco1/ascii-vj-remix/actions/runs/34185767363), Worker `1bf9e78a-798d-48aa-8525-f454cd43a163`. The canonical client/server contract is byte-identical.

The [published 1.0.0 release](https://github.com/aindaco1/auto-subtitle/releases/tag/v1.0.0) uses immutable source tag `dda6b33`. [CI 34186084184](https://github.com/aindaco1/auto-subtitle/actions/runs/34186084184) passed engine/Python, Swift tests, clean pinned Whisper and speech-helper builds, and the generated model-manifest comparison. Apple accepted both app and final APFS DMG with no warnings. Both tickets are stapled; Gatekeeper and strict mounted nested-code/runtime checks pass. Sparkle's Ed25519 signature covers the DMG; the feed also has an embedded signature. GitHub reports matching SHA-256 digests for all five published assets.

The first HFS+ candidate failed strict mounted-app validation because the filesystem synthesized FinderInfo on hidden runtime files; it was never published. APFS resolves that packaging issue. Local long TLS uploads also failed; the documented Notary API and bounded draft-asset assembly completed the transfers. [Hosted assembly 34186822923](https://github.com/aindaco1/auto-subtitle/actions/runs/34186822923) verified the complete DMG hash before upload and removed all temporary parts before publication. Private detailed release evidence stays under ignored `artifacts/releases/1.0.0/`.

A fresh unauthenticated public download passed every checksum, public-key archive signature verification, byte-for-byte latest-feed comparison, DMG/app tickets, Gatekeeper, mounted nested signatures and bundled-runtime imports. The public DMG's SHA-256 is `8f2657944f7519f028ff62832fad9f7cf3ca87d574740ed6c3441828c70eb1b9`. Its app was installed into the local Applications folder and its version, signature, ticket and Gatekeeper status verified again. The prior installed app is retained for rollback.

**Pending interactive acceptance:** the Mac locked before the public copy's native launch and real Sparkle download/install/relaunch cycle. The signed 0.9.9/build 9999 test fixture is prepared against the real public 1.0.0 feed, but that updater hop has not run. Native full-film generation/save and diagnostic preview/export above used the signed candidate before publication. Do not treat source, feed or archive checks as proof of an installed update cycle.

After public verification, 33 obsolete local builds, DMGs, duplicate downloaded test weights and superseded experiments were moved recoverably to Trash. Current release assets, development runtimes/incremental builds, model and job stores, original media/exports, representative private fixtures and compact evidence remain. The current/default branch and worktree are retained; there were no stale task branches to delete.

## 0.3.1 language-repair follow-up

- **44 Node tests and three Swift contract tests pass.** Added passage auditing, acoustic agreement, code-switch preservation, token-anchor validation, language/context cache separation, source alias safety and discovery skipping damaged candidates. The prior 27 Python and 31 relay tests below were not rerun for this recognition-only change.
- Release Swift/helper builds, pinned static Whisper build, bundle dependency/import checks and ad-hoc signature verification pass. The verified 0.3.1 build 2 DMG was mounted, its copy installed and its engine exercised directly.
- The installed engine generated **874 cues: 37 language repairs, six flagged cues corroborated without changes, and 39 unresolved language-review cues**. All 874 start/end timestamp pairs exactly match the original native SRT. Original files were preserved and the candidate saved separately as `Bajo La Piel.language-checked.srt`, with a private JSON audit and readable review list.
- Reused all 108 verified primary Parakeet chunks. The language audit flagged 82 cues in 42 bounded retry groups. Matching caches avoid repeating completed fallback recognition. These counts do not measure word-error rate or prove all repaired wording correct.
- A genuine Spanish/English/Spanish control preserves independently corroborated English speech. The original control run used the earlier acceptance policy; synthetic per-cue code-switch and polarity regressions pass under the final policy. Twelve seconds of silence returns no speech and produces no invented captions.
- Model reuse: the existing MacWhisper file matched the pinned publisher's size and SHA-256 and was imported locally. Reuse does not require MacWhisper to run or be installed for other users.
- **Independent fresh Whisper download passed:** 1,624,555,275 bytes downloaded from the pinned publisher using the installed app's shared installer into an empty isolated destination; no existing model was supplied. Full size/SHA-256 verification completed in about 105 seconds on this connection. Fresh inference using those downloaded weights, with networking denied for the process tree, identified Spanish and returned 61 words from the 28-second sample.
- Native UI inspection confirmed Automatic language, Repair language mismatches enabled, and separate Find/Import/Download controls for Parakeet and optional Whisper. The new native Generate/save automation could not be completed: the file chooser remained disabled and its automation handle later timed out. The app relaunched normally; source/installed-engine processing and separate output preservation passed. The successful 0.3.0 native save below is prior evidence, not a new 0.3.1 UI acceptance claim.
- Cancellation removed temporary audio without writing a receipt when canceled during extraction. Generic process-group cancellation regressions pass. Cancellation during active Whisper inference and long-job native relaunch remain acceptance checks.

Private detailed evidence is under ignored `artifacts/testing/language-investigation/` and `artifacts/testing/film-language-repair-installed.log`. The independent-download model is an isolated test copy, not a bundled app asset. No movie, audio, subtitles or private reports were uploaded.

## Prior 0.3.0 automated baseline

- 34 Node tests: SRT/ASS/Unicode/encoding/quantization, exact duplicate safeguards, uncertain-region preservation, phrase-edge and dictionary wording protection, generated boundaries, process cancellation, model integrity/path/redirect/cancellation/repair, and diagnostic privacy/receipts.
- 27 Python tests: retained legacy regressions and timing recovery. Injected transforms recover within 150 ms p95; silence and a discontinuity fail global acceptance. Supported pieces around a synthetic cut cover over 60% of cues at under 400 ms p95.
- Two Swift tests: translations cannot enable wording changes; Generate omits imported subtitles and Improve.
- 31 existing-relay tests, including shared serialized grouping, fixed repository routing, canonical ordering, duplicate retries, rejection of private fields, and current-state submission refusal.
- Swift release builds and packaged dependency/signature verification pass. The bundled Python imports its own NumPy, WebRTC VAD and ffsubsync with developer PATH entries removed.

## Private film checks

The supplied MKV is 6,427.720 seconds, 25 fps, with one Spanish audio track. Its supplied UTF-8 SRT has 1,432 cues. Originals remain in their supplied location and are not uploaded or committed. Fixtures and result logs are under ignored `artifacts/testing/`; private speech/change caches live in Application Support.

| Check | Observed result |
|---|---|
| Timing-only full film | Sampled activity accepted consistent timing; final identity policy retains the existing offset. No speech model or full transcription needed. |
| Unicode timing-only full pipeline | 1,432 Japanese test payloads retained byte-for-byte through an injected +2.4-second delay correction; a nonexistent model path was never loaded. This is a language-independence test, not a natural translation accuracy benchmark. |
| +2.4-second injected delay | Recovered −2.45 seconds, 1,432 cues; about 7.3 seconds with cached activity. |
| Times divided by 1.2 | Recovered 1.2 rate and −0.05-second offset; about 4.5 seconds with cached activity. |
| Times multiplied by 1.2 | Recovered 0.833333 rate and −0.05-second offset; about 4.6 seconds with cached activity. |
| Full-film Generate | 108 recognition chunks completed; 874 SRT cues; 205 readability advisories. Later review confirmed English intrusion despite Spanish dominant-language detection. See the [language investigation](investigations/2026-09-07-spanish-language-drift.md); generation quality is not accepted. Cached retry reused recognition after an export-boundary bug was fixed. |
| Full-film Improve | Final run applied two spelling repairs with second-pass recognition and dictionary agreement; 1,432 cues. Valid-word substitutions found during review were excluded. The private audit records every change. This is not measured correction precision or WER. |
| Network-denied recognition | A fresh 90-second Spanish sample completed two chunks and exported seven ASS cues under `sandbox-exec` with network denied for the process tree. |
| Model reuse | Existing compatible Podcast Visualizer model imported locally; all 17 files verified. |
| Secure model download | Full 483 MB pinned model downloaded to an isolated test folder; all 17 files passed size/SHA-256 verification. Real redirects and a slow encoder download exposed and resolved CDN/timeout gaps. |
| Native UI | Installed DMG copy launched, imported the film, generated 874 captions from verified checkpoints and saved through the native panel. Earlier timing-only run, translation option disabling Improve, JSON preview/export and synthetic crash import also passed. Crash preview removed every fake private field; no report was sent. |
| Relay | Owner-added repository access verified; deployed health succeeds and malformed intake returns HTTP 400. No valid report sent. |

The injected timing cases measure recovery relative to the supplied rough SRT, not independently annotated dialogue boundaries. Synthetic Unicode payload/translation-independent activity tests establish that lexical language does not block timing; they do not establish natural-translation boundary quality. Sparse, musical, repetitive or differently edited audio can remain unresolved, as shown in the result summary.

## Remaining acceptance

Generation-quality acceptance remains open: the selective repair pass reduces the observed English intrusion but leaves 39 uncertain captions for review. Two agreeing decodes can share an error. The [investigation](investigations/2026-09-07-spanish-language-drift.md) records the original defect and implemented mitigation; human bilingual review is still required.

1. Bilingual human-reviewed translated cues with different grouping/paraphrases, cuts, subtitles outside Parakeet's registry, and real multiple-track timestamp offsets.
2. Held-out Spanish/English correction precision and WER/CER, names/polarity, omissions and silence hallucinations. Expand native-speaker checks across the 25 advertised recognition languages.
3. Full keyboard/VoiceOver, actual light appearance, reduced motion, smaller windows, long-job cancellation/relaunch, and manual playback of ASS karaoke/animation after rate changes. Earlier automation handle errors did not recur after duplicate test bundles were archived and the installed copy was exercised.
4. Clean macOS 15 on an 8 GB Apple Silicon Mac, peak memory/disk/time, network-denied whole-app operation and external user acceptance. Current-host signed-app and release-package checks are recorded above; they do not establish minimum-device performance.
5. A real user-reviewed failure report remains untested; authorized synthetic GitHub delivery/aggregation is complete in 1.0.0. Private reports are never submitted as test fixtures.

The first candidate intentionally wraps or flags imported long cues when trustworthy internal speech boundaries are unavailable. It does not invent timing merely to meet line-length targets. Save and review outputs before replacing subtitles in a media library.
