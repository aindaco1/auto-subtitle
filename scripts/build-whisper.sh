#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
revision=371b5a7561823ab2bb32142d2751e35e7534727b
source_dir="${AUTO_SUBTITLE_WHISPER_SOURCE:-$PWD/artifacts/tooling/whisper.cpp}"
if [ ! -d "$source_dir/.git" ]; then
  mkdir -p "$(dirname "$source_dir")"
  git clone --depth 1 --branch b4938 https://github.com/ggml-org/whisper.cpp.git "$source_dir"
fi
test "$(git -C "$source_dir" rev-parse HEAD)" = "$revision"
# Upstream CMake rewrites the JavaScript package version while configuring native builds.
git -C "$source_dir" diff --exit-code HEAD --quiet -- . ':!bindings/javascript/package.json'
cmake -S "$source_dir" -B "$source_dir/build" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_CURL=OFF
cmake --build "$source_dir/build" --config Release --target whisper-cli -j 6
mkdir -p runtime/macos-arm64/bin resources/licenses
cp "$source_dir/build/bin/whisper-cli" runtime/macos-arm64/bin/whisper-cli.new
codesign --force --sign - runtime/macos-arm64/bin/whisper-cli.new
mv -f runtime/macos-arm64/bin/whisper-cli.new runtime/macos-arm64/bin/whisper-cli
cp "$source_dir/LICENSE" resources/licenses/whisper.cpp-MIT.txt
runtime/macos-arm64/bin/whisper-cli --version
