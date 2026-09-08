# Third-party notices

Full notices ship in `resources/licenses/` and in the bundled runtime's package metadata.

| Component | Version / revision | License |
|---|---|---|
| RecordSpeech | 8897446b348271d5d548278fa6f6a91053d9bd6d | MIT |
| Dust Wave timed-text | 6da7db044f668a481d4bac2e5c2c8d78d17a3d2d | MIT |
| FluidAudio | 0.15.5, 19600a485baa4998812e4654b70d2bab8f2c9949 | Apache-2.0 |
| Sparkle updater | 2.9.6, locked in macos/Package.resolved | MIT, resources/licenses/Sparkle-LICENSE.txt |
| Node.js | 24.19.0 | Node contributors license, runtime/LICENSE.Node |
| FFmpeg | 8.1.2 | LGPL-2.1-or-later, runtime/COPYING.LGPLv2.1 |
| CPython | 3.11.15, python-build-standalone 20260602 | PSF, bundled Python LICENSE.txt |
| ffsubsync | 0.4.29 | MIT, bundled dist-info/LICENSE |
| WebRTC VAD Python wrappers | 2.0.10 / wheels 2.0.14 | MIT and bundled WebRTC notices |
| NumPy and other Python dependencies | requirements-sync.lock | bundled dist-info license files |

FluidAudio's fastcluster/VBx notices and the resolved Swift dependency closure's Sparkle/ArgumentParser notices are retained conservatively, including dependencies whose unused code the linker may remove. The speech executable directly uses RecordSpeech; no speaker-diarization model is bundled.

The app reuses Podcast Visualizer's exact verified Node and FFmpeg runtime. Source URLs, source archive hashes, build flags and pre-signing binary hashes are recorded in the runtime manifests. FFmpeg disables networking, GPL and nonfree components. Its bundled dynamic text-rendering libraries retain their upstream licenses in the runtime notice directory. For redistribution, retain corresponding FFmpeg/LGPL library source and rebuild instructions from Podcast Visualizer's runtime build scripts; do not treat an ad-hoc development app as a distribution compliance artifact.

Model weights are downloaded or imported separately, never included in the app. NVIDIA Parakeet TDT v3 and Fluid Inference's Core ML conversion are attributed here. The [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) declares CC BY 4.0. The [pinned Core ML card](https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml/tree/aed02740059203c4a87495924f685de3722ae9ce) declares CC BY 4.0 in its metadata, while its prose license section refers to the Apache-2.0 software library. Record's pinned file manifest identifies the exact conversion used. See the [CC BY 4.0 terms](https://creativecommons.org/licenses/by/4.0/) and the upstream cards before redistribution. Auto Subtitle does not modify the imported model files.

The original icon was generated for this project; canonical artwork and reproduction notes are in `resources/app-icon/`.
## Language repair

The optional language repair runtime is whisper.cpp 1.9.3, commit `371b5a7561823ab2bb32142d2751e35e7534727b`, built locally with static ggml and an embedded Metal library. License: MIT; see `resources/licenses/whisper.cpp-MIT.txt`. Source: https://github.com/ggml-org/whisper.cpp.

The optional Whisper large-v3-turbo weights are downloaded or reused separately under the MIT license. Publisher conversion: `ggerganov/whisper.cpp`, pinned in `resources/model-manifests/whisper-turbo.json`; original model: https://huggingface.co/openai/whisper-large-v3-turbo. Model files are not included in the app or repository.
