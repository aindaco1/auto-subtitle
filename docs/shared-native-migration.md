# Shared native migration

Speech and formatting helpers depend on `shared/dust-wave-platform/native`.
The former uses `DustWaveSpeech` with unchanged FluidAudio 0.15.5. The latter uses
`DustWaveAppleIntelligence` for fresh bounded sessions, greedy generation,
cancellation and passive metadata. Subtitle policy, NaturalLanguage boundaries,
word/timing preservation, prompts, response schemas and fallback remain here.

The formatting helper is now a SwiftPM executable. App packaging and
`scripts/check-formatting.mjs` build that same target; evaluation evidence and
build caches include the shared generation source, and production caches remain
bound to the compiled helper hash. No Jev client enters the app bundle.

Initialize submodules, run `npm test`, the Python suite from CI, native builds,
and `npm run test:apple -- --live` with the existing developer credentials.
Keep the fixture, calibrated questions and policy frozen for baseline comparison.
Jev reviews and exact/native failures cannot become a combined pass.

Revert the Platform gitlink, helper manifests/lockfiles, adapter/build changes and
restore the old Record gitlink to roll back. No job data or model cache changes.
This migration creates no version bump, installation or release.
