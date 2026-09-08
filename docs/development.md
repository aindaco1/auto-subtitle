# Build and package

Build on an Apple Silicon Mac with Swift 6/Xcode command line tools, Python 3.11+, uv, CMake, and Node 24 for developer tests. End users need none of these tools.

Initialize pinned dependencies with `git submodule update --init --recursive`. RecordSpeech owns the model manifest; `speech-sidecar/Package.resolved` locks the Swift closure. Do not update submodules casually while rebuilding.

## Runtime preparation

The developer preparation script accepts two already obtained distributions: the pinned Podcast Visualizer `runtime/macos-arm64` and uv's CPython 3.11.15 python-build-standalone build 20260602. Resolve the actual distribution directory rather than copying uv's top-level symlink. `uv python install 3.11.15` obtains it from uv's official distribution inventory.

```sh
python3 scripts/prepare-runtime.py /path/to/podcast-visualizer/runtime/macos-arm64 /path/to/cpython-3.11.15-macos-aarch64-none
```

The script validates each media runtime file against this repository's `resources/runtime-sources/` pins, copies only Node/FFmpeg and their dependency closure, installs `requirements-sync.lock` into a separate Python copy, and relocates Mach-O dependencies. It never modifies the source Python distribution. The speech helper is built separately. `runtime/` is ignored by Git.

The Node archive is from nodejs.org v24.19.0; FFmpeg source is ffmpeg.org 8.1.2. Exact archive and binary hashes are recorded in the checked-in source manifests. Model installation uses Record's 17-file pinned inventory, exact size/SHA-256, HTTPS host checks before redirects, staging, cancellation and a 30-minute per-request bound suitable for the 445 MB encoder. A damaged installation is retained as a sibling `.replaced-invalid-…` backup only after a verified replacement is ready.

## Optional repair runtime

`build-app.sh` invokes `scripts/build-whisper.sh`, which obtains official whisper.cpp tag `b4938` and verifies commit `371b5a7561823ab2bb32142d2751e35e7534727b` before building. The source is kept under ignored `artifacts/tooling/`; `AUTO_SUBTITLE_WHISPER_SOURCE` can select an existing matching checkout. The build rejects tracked source changes, except the JavaScript package version metadata that upstream CMake rewrites.

The arm64 macOS 15 runtime statically links whisper/ggml and embeds its Metal library, uses system frameworks, and disables CURL and OpenMP. The CLI reports `1.9.3-dev` for the pinned 1.9.3 release source. The installer bundles this executable, not model weights. Replace the signed binary atomically: copying over an executing binary inode caused macOS to kill later inference during local validation.

`resources/model-manifests/whisper-turbo.json` pins the 1.62 GB large-v3-turbo GGML model by publisher revision, exact bytes and SHA-256. Discovery uses common caches and a narrowly declared MacWhisper filename alias, then imports through the existing verified installer. No network access is needed after model setup.

## Checks

```sh
npm test
uv run --no-project --python 3.11 --with pytest --with-requirements requirements-sync.lock python -m pytest -q
swift test --package-path macos
bash scripts/build-app.sh
```

Pytest is scoped to `tests/`, not bundled third-party test suites. The GitHub workflow runs engine/Python, Swift and pinned Whisper build gates using pinned actions inherited from the Podcast Visualizer CI baseline. It has been added locally but has not run on GitHub in this task.

`build-app.sh` emits `~/Library/Caches/AutoSubtitleBuild/Auto Subtitle.app` by default; `AUTO_SUBTITLE_BUILD_DIR` overrides the parent. App directories under iCloud can acquire Finder metadata that invalidates signatures, so keep the working bundle outside CloudDocs. Existing builds are retained as `.backup` directories. The bundle gate checks local Python imports, required executables (including a runnable Whisper CLI), contained symlinks and Mach-O dependencies with only `/usr/bin:/bin` on PATH. It then applies and verifies an ad-hoc local signature.

```sh
bash scripts/package-local.sh
```

This produces a verified local-test DMG and checksum under `dist/`. It is not a notarized release. Use the [release runbook](release-runbook.md) for Developer ID signing, app and DMG notarization, signed GitHub feeds, and installed-artifact/update acceptance. Keep the local path for development; never publish its ad-hoc DMG as a release.

## Existing crash relay

Auto Subtitle owns `engine/diagnostics-contract.mjs` and the adapter in `integrations/crash-relay/`. Synchronize them with:

```sh
node scripts/sync-crash-relay.mjs /path/to/ascii-vj-remix/crash-relay
```

The existing relay imports these files and reuses `ReviewedReportGroup`. Run its `npm run check` before deployment. Preserve other app routes, bindings and GitHub permissions. Deployment and actual GitHub delivery are separate checks; do not create public test issues without explicit authorization.
