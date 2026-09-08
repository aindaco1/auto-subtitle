#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build-whisper.sh
swift build --package-path macos -c release
swift build --package-path speech-sidecar -c release --product auto-subtitle-speech
cp speech-sidecar/.build/release/auto-subtitle-speech runtime/macos-arm64/bin/
runtime/macos-arm64/bin/auto-subtitle-speech manifest > resources/model-manifests/parakeet-v3.json
bash scripts/generate-icon.sh
python3 scripts/relocate-python.py runtime/macos-arm64/python
build_dir="${AUTO_SUBTITLE_BUILD_DIR:-$HOME/Library/Caches/AutoSubtitleBuild}"
mkdir -p "$build_dir"
app="$build_dir/Auto Subtitle.app"
if [ -d "$app" ]; then mv "$app" "$build_dir/Auto Subtitle.previous.$(date +%s).backup"; fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources/engine-root/shared/dust-wave-platform/packages"
ditto --norsrc --noextattr macos/.build/release/Sparkle.framework "$app/Contents/Frameworks/Sparkle.framework"
cp macos/.build/release/AutoSubtitle "$app/Contents/MacOS/"
cp macos/Info.plist "$app/Contents/Info.plist"
cp resources/app-icon/AppIcon.icns "$app/Contents/Resources/"
for name in engine resources runtime; do
  ditto --norsrc --noextattr "$name" "$app/Contents/Resources/engine-root/$name"
done
ditto --norsrc --noextattr shared/dust-wave-platform/packages/timed-text "$app/Contents/Resources/engine-root/shared/dust-wave-platform/packages/timed-text"
cp shared/dust-wave-platform/LICENSE "$app/Contents/Resources/engine-root/shared/dust-wave-platform/LICENSE"
cp THIRD_PARTY_NOTICES.md "$app/Contents/Resources/engine-root/THIRD_PARTY_NOTICES.md"
python3 scripts/verify-bundle.py "$app"
# Local build: an ad-hoc signature is sufficient. Distribution signing is separate.
chmod -R u+w "$app"
xattr -cr "$app"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
printf '%s\n' "$app"
