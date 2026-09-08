#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
master=resources/app-icon/auto-subtitle-1024.png
iconset=build/AutoSubtitle.iconset
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$master" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$master" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o resources/app-icon/AppIcon.icns
