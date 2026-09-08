#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app="${1:-$HOME/Library/Caches/AutoSubtitleBuild/Auto Subtitle.app}"
test -d "$app"
codesign --verify --deep --strict "$app"
staging="$(mktemp -d "$HOME/Library/Caches/AutoSubtitlePackage.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
ditto --norsrc --noextattr "$app" "$staging/Auto Subtitle.app"
ln -s /Applications "$staging/Applications"
mkdir -p dist
version=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")
output="dist/Auto-Subtitle-${version}-arm64-local.dmg"
if [ -e "$output" ]; then mv "$output" "$output.previous.$(date +%s)"; fi
hdiutil create -quiet -volname "Auto Subtitle" -srcfolder "$staging" -format UDZO "$output"
hdiutil verify "$output"
shasum -a 256 "$output" > "$output.sha256"
printf '%s\n' "$output"
