# Validation

Recorded September 7–23, 2026 on Apple Silicon, macOS 26.6.2 and 27. Each section distinguishes local, provider and installed-artifact evidence. Clean macOS 15 and human subtitle acceptance remain separate.

## 1.0.2 candidate checks — September 23, 2026

- 71 Node, 29 Python and six app Swift tests pass. Both native helpers build from
  Platform `0affb6c5652611b87947bd87762d8aa17d35ea32`; speech keeps FluidAudio
  0.15.5. Source/model manifests, lexical and timestamp preservation, provider
  isolation, malformed evidence, cache binding and cancellation are covered.
- The fixed public Jev controls pass 36/36. The 19-case candidate has exact
  preservation throughout, one safely rejected Spanish synonym proposal, one
  English phrase review and one inspected false Jev finding about a comma-ended
  caption. Its combined command remains non-passing. See
  [the full result and evidence locations](jev-apple-formatting.md).
- The built bundle generated two English and two Spanish captions from fresh public
  synthetic speech. Original audio SHA-256 values are unchanged. Cleanup off/on
  preserves all recognized words and every timestamp pair; cleanup off makes no
  Apple requests. The English recognizer spells the spoken name Ana as Anna,
  illustrating that this is pipeline evidence, not improved recognition accuracy.
- Developer ID signing, strict nested signature validation, bundled runtime checks,
  app and DMG notarization, stapling and Gatekeeper checks pass for 1.0.2/build 10002.
  The working app is outside iCloud; source and model checkpoints remain intact.
- The signed app launches and its Generate UI and model-ready state render correctly.
  Native file-picker automation selects the local synthetic movie, but Open remains
  disabled; import/Save acceptance is still pending. Earlier GUI acceptance is not
  counted as a new candidate pass. Publication and the public updater check remain
  pending.

Local evidence is under `artifacts/evaluation/release-1.0.2-*`, with source-preserved
sync copies under `artifacts/sync-copies-before-1.0.2/`. The DMG and signed feed are
staged in `dist/`. No release tag has been created by this validation record.

## 1.0.1 release checks — September 23, 2026

- 65 Node, six Swift and 29 Python tests pass on Apple Silicon/macOS 27. Shared production/evaluation policy covers exact word/timing preservation, automatic cleanup punctuation, unavailable-model fallback, malformed responses, cancellation and verified caches. The public Jev calibration has 28/28 labeled passes. Its targeted 13-case final evaluation has 12 passes and one review, with no semantic failures; see [scope and raw-evidence locations](jev-apple-formatting.md). This is not a general quality or speed benchmark.
- The actual bundled engine was exercised on twelve synthetic English SRT/translated Spanish ASS cues, including four additional sentences outside the tuning corpus. All words, numeric forms and timestamp pairs were preserved; ASS comments/styles/italics remained intact. The attempted expansion of “Dr.” to “Doctor” was rejected and source text retained. Punctuation/capitalization runs automatically with cleanup; cleanup off skips the native helper.
- On this host, the six-cue English batch took 28.6 seconds cold and 26 ms from the verified cache; Spanish took 16.9 seconds cold and 18 ms cached. Cold time included model startup, punctuation and layout. Cache timings cover formatting only, not media analysis. These small samples do not predict full-film or minimum-device speed.
- Build outputs and Swift scratch products now remain outside iCloud. The release helper targets macOS 15 and runtime-gates Foundation Models at macOS 26. Native macOS 26 inference and clean macOS 15/8 GB hardware acceptance remain untested.

The signed candidate imported/aligned translated ASS, generated six fresh SRT captions from synthetic speech, saved both through native panels, and exported the reviewed diagnostic JSON (1.0.1/build 10001) without private content. Short-sample timing was uncertain and preserved, as reported. Rendered English/Spanish examples were inspected. A final single-valid-break punctuation regression is covered by the additional Node test; the corrected bundle repeats package gates. The final signed bundle also generated six cues with cleanup off/on: every recognized word, numeric form and timestamp pair matched, and cleanup off made zero Apple requests. Recognition still rendered the synthetic spoken name “Ana Ruiz” as “Anaruis”; formatting preserved that ASR output, so this is not a recognition-accuracy acceptance claim. Existing bilingual human-review limitations below still apply.

The [published 1.0.1 release](https://github.com/aindaco1/auto-subtitle/releases/tag/v1.0.1) uses immutable source `fca7895521c38441d9d979a46e0a06b60981ce15`. [CI 35823539722](https://github.com/aindaco1/auto-subtitle/actions/runs/35823539722) passed engine/Python, stable Xcode 26.3 and Xcode 27 lanes for that exact commit. Apple accepted the final app and APFS DMG; both tickets are stapled. Uploaded hashes matched all five local release assets before publication. A fresh unauthenticated download passed every checksum, the latest-feed comparison, public-key Sparkle archive verification, mounted signatures, Gatekeeper and bundled-runtime imports. Final DMG SHA-256: `21d91763b7c45dbf341ce4c7de640d55e23810d96f15fe0b3d9548dacd184809`.

The real installed 1.0.0/build 10000 found the public update, downloaded through Sparkle, completed **Install and Relaunch**, and reported 1.0.1/build 10001. A second check reported it current. All 5,178 files and symlinks matched the public DMG; installed strict signatures, ticket, Gatekeeper and runtime checks passed. A rollback copy was preserved until this verification completed.

After acceptance, 14 obsolete items (about 2.93 GB apparent size) were moved recoverably to Trash: superseded app/package copies, duplicate Swift builds, temporary probe/download products and an invalid iCloud-duplicate Git ref. An iCloud file could not use the normal Trash API, so remaining items were moved into a dedicated Trash folder with an original-path restoration map. The merged release branch was removed locally and remotely; only `main` remains. Current release assets, the installed app, development runtimes/build/test caches, fixtures, compact evidence, original media/exports and app-owned models/jobs remain. Detailed local evidence is under ignored `artifacts/releases/1.0.1/` and `artifacts/testing/formatting-release/`.

## 1.0.0 release checks

- **49 Node, five Swift, 27 Python and 32 relay tests pass.** Updater policy tests cover busy-job refusal and launch checks. Diagnostic regressions cover current-state delivery, strict privacy, actual incident build metadata, crash grouping independent of the current workflow, and duplicate receipts.
- The Developer ID signed app passes strict nested signature checks, contained-runtime/import checks and a signed Node JIT smoke. Sparkle 2.9.6 uses a dedicated Ed25519 key and the official GitHub release feed. Accepted installs wait for active processing, model setup and report delivery to finish.
- Native import and Save now use sheets. The signed 1.0.0 app imported the full film, reused verified recognition checkpoints, generated 874 cues with 37 repairs, six corroborated unchanged cues and 39 unresolved advisories, and saved SRT through the native panel. The export is byte-identical to the prior language-checked output; all 874 original native timestamp pairs are retained.
- Native Help preview and JSON export passed with app 1.0.0/build 10000 and the expected workflow state. The exact preview enables reviewed submission. The exported JSON contains no media title, paths or transcript; it was not submitted.
- Authorized synthetic GitHub testing verified two distinct crashes aggregate to one issue with count two; retrying the same ID returns the same issue without incrementing its count. A synthetic current state created a separate issue. [Crash test #2](https://github.com/aindaco1/auto-subtitle/issues/2) and [state test #3](https://github.com/aindaco1/auto-subtitle/issues/3) are labeled as tests and closed. Only artificial metadata was sent.
- Relay source was validated with 32 tests and deployment dry-run, then deployed from committed source `6b08725` by [hosted run 34185767363](https://github.com/aindaco1/ascii-vj-remix/actions/runs/34185767363), Worker `1bf9e78a-798d-48aa-8525-f454cd43a163`. The canonical client/server contract is byte-identical.

The [published 1.0.0 release](https://github.com/aindaco1/auto-subtitle/releases/tag/v1.0.0) uses immutable source tag `dda6b33`. [CI 34186084184](https://github.com/aindaco1/auto-subtitle/actions/runs/34186084184) passed engine/Python, Swift tests, clean pinned Whisper and speech-helper builds, and the generated model-manifest comparison. Apple accepted both app and final APFS DMG with no warnings. Both tickets are stapled; Gatekeeper and strict mounted nested-code/runtime checks pass. Sparkle's Ed25519 signature covers the DMG; the feed also has an embedded signature. GitHub reports matching SHA-256 digests for all five published assets.

The first HFS+ candidate failed strict mounted-app validation because the filesystem synthesized FinderInfo on hidden runtime files; it was never published. APFS resolves that packaging issue. Local long TLS uploads also failed; the documented Notary API and bounded draft-asset assembly completed the transfers. [Hosted assembly 34186822923](https://github.com/aindaco1/auto-subtitle/actions/runs/34186822923) verified the complete DMG hash before upload and removed all temporary parts before publication. Private detailed release evidence stays under ignored `artifacts/releases/1.0.0/`.

A fresh unauthenticated public download passed every checksum, public-key archive signature verification, byte-for-byte latest-feed comparison, DMG/app tickets, Gatekeeper, mounted nested signatures and bundled-runtime imports. The public DMG's SHA-256 is `8f2657944f7519f028ff62832fad9f7cf3ca87d574740ed6c3441828c70eb1b9`. Its app was installed into the local Applications folder and its version, signature, ticket and Gatekeeper status verified again.

**Interactive public-app and update acceptance passed after unlocking the Mac.** The installed public app launched and its top-right update button reported that 1.0.0 is current. A signed local 0.9.9/build 9999 fixture then found the real public 1.0.0 release on launch, downloaded it through Sparkle, reached Ready to Install, and completed Install and Relaunch. The new process reported 1.0.0/build 10000 and a fresh update check again reported the current version. All 5,148 compared files and package symlinks matched the preserved public-DMG installation; strict signatures, the stapled ticket, Gatekeeper and contained-runtime imports passed again. The fixture was never published: 0.3.x users still need the documented first manual install. Native full-film generation/save and diagnostic preview/export above used the signed candidate before publication.

After public verification, 33 obsolete local builds, DMGs, duplicate downloaded test weights and superseded experiments were moved recoverably to Trash. After the installed update passed, four remaining rollback/test/download copies were also moved to Trash. Current release assets, the installed 1.0.0 app, development runtimes/incremental builds, model and job stores, original media/exports, representative private fixtures and compact evidence remain. The current/default branch and worktree are retained; there were no stale task branches to delete.

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
