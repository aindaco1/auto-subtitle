# Signed releases and updates

Auto Subtitle uses Sparkle 2.9.6, pinned in the Swift package and lockfile. The official feed is `https://github.com/aindaco1/auto-subtitle/releases/latest/download/appcast.xml`; archives point to immutable versioned GitHub release assets. The dedicated public key is checked into `resources/sparkle-public-key.txt`. Its private key belongs in Apple Auth or the release machine's Keychain, never in Git or the app.

The app makes one quiet launch check and retains a top-right button and application-menu command for manual checks. Installation and relaunch require user action. Checks defer while processing/report submission is active, and an accepted installation cannot interrupt an active operation. Automatic installation and Sparkle system profiling are disabled. Offline update checks do not prevent local subtitle work.

## Prepare

1. Update `package.json`, `pyproject.toml`, the Python package version, `macos/Info.plist`, and `CHANGELOG.md`. Increase the numeric bundle build monotonically.
2. Run `npm test`, the locked Python tests and `swift test --package-path macos`. Run the relay's `npm run check` if its contract or adapter changes.
3. Run `bash scripts/build-app.sh`. It builds outside iCloud and bundles Sparkle, the pinned speech/media runtimes and notices. No model weights are included.
4. Run native import, generation/alignment, Save and reviewed diagnostic export. Verify resulting files and originals on disk. For reporting changes, exercise explicit synthetic GitHub tests only when authorized and close the resulting test issues.

## Sign and notarize

`scripts/release.py` uses the available Developer ID Application identity, the API `.p8` file and issuer file in the sibling Apple Auth folder, and Auto Subtitle's dedicated Sparkle private-key file. `AUTO_SUBTITLE_SIGNING_IDENTITY` and `AUTO_SUBTITLE_APPLE_AUTH` override those locations. The certificate is already imported in the release machine's Keychain; never log its password or any private key. The API uploader retains credentials only in memory and saves only submission IDs, hashes and status. Its dependencies are pinned by the adjacent uv script lockfile.

```sh
python3 scripts/release.py sign "$HOME/Library/Caches/AutoSubtitleBuild/Auto Subtitle.app"
python3 scripts/release.py package "$HOME/Library/Caches/AutoSubtitleBuild/Auto Subtitle.app"
python3 scripts/release.py verify dist/Auto-Subtitle-1.0.0-arm64.dmg
python3 scripts/release.py appcast dist/Auto-Subtitle-1.0.0-arm64.dmg
```

Use the current version in the last two commands. The signer inventories nested Mach-O code, signs it inside-out with hardened runtime, preserves Sparkle Downloader's entitlements, and gives only Node the required JIT entitlement. Do not use `codesign --deep` to sign a release; `--deep` is used only for verification.

The package gate notarizes and staples the app first, then creates a DMG containing only the app and an Applications shortcut, signs/notarizes/staples that DMG, and requires Gatekeeper acceptance. The default uploader follows [Apple's Notary API guide](https://developer.apple.com/documentation/notaryapi/submitting-software-for-notarization-over-the-web) with bounded-retry multipart S3 upload, avoiding observed `notarytool` upload crashes. It retrieves Apple's log even on acceptance and retains it privately. `AUTO_SUBTITLE_NOTARY_TRANSPORT=tool` selects the original local-APFS/relative-path `notarytool` flow derived from CutNotes. If a submit call crashes, inspect Apple's history before retrying: a pending submission may exist even if the client returned no ID. Retain accepted submission evidence separately for the app and DMG. Resume a successfully uploaded pending API request with the same artifact and receipt; do not blindly create duplicate submissions.

The DMG uses APFS. HFS+ can synthesize FinderInfo metadata for hidden runtime files and invalidate strict signature verification on the mounted image. Packaging therefore verifies the mounted app and contained runtimes before submitting the DMG. A valid stapled app ticket may be reused while rebuilding an unpublished disk image; its signature and Gatekeeper status are checked again.

## Publish and verify

Commit the reviewed source and lockfiles; require successful CI for that exact commit. Create an immutable annotated `vMAJOR.MINOR.PATCH` tag, then publish a stable GitHub release with the DMG, signed `appcast.xml`, `SHA256SUMS`, and app/DMG notarization receipts. Do not publish until the local signature, notarization, staple, Gatekeeper, mount and runtime gates pass. Never move a published tag or replace an existing release archive silently.

If a long local GitHub upload repeatedly fails, keep the release in draft and upload numbered parts such as `upload-part-001-of-018.bin`, at most 16 MiB each. Verify each provider-reported digest. Dispatch **Assemble staged release** with the draft tag; it requires contiguous parts, reconstructs the image on GitHub, checks the full image against the already uploaded `SHA256SUMS`, uploads the exact image, verifies GitHub's digest, and removes the parts. It never publishes or overwrites a published asset. Inspect the final five assets and their hashes before publishing the draft.

Download the public assets into an empty directory, compare their checksums and the live latest feed, verify the Sparkle archive signature, mount and inspect the downloaded DMG, and launch its installed app. On a safe older test installation, exercise the real public update/download/install/relaunch path and confirm the resulting bundle version. The initial 0.3.x testing app has no updater; install 1.0.0 manually once to gain future in-app updates.

Only after public verification, move superseded local app/DMG builds, extracted test models, packaging work directories and obsolete experiments to the Trash. Retain the current release, source/runtime/model manifests, local development runtimes and incremental build caches, representative fixtures and compact validation evidence. Preserve original media, saved subtitles and app-owned models/job checkpoints. Inspect branches and worktrees before deleting anything; keep unmerged work and the active/default branch.
