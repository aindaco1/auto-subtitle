# Third-party notices

## Shared desktop services

Dust Wave Platform desktop 0.2.0 provides shared updater and reviewed-report mechanics under MIT. Original Record, Auto Subtitle, CutNotes and Podcast Visualizer notices remain in `shared/dust-wave-platform/desktop/LICENSE.*` and are packaged with Platform's MIT license in `Contents/Resources/Licenses`. Desktop Core 0.1.0 also supplies the Node reviewed-report client; its packaged runtime includes the Platform MIT license.

Full notices ship in `resources/licenses/` and in the bundled runtime's package metadata.

| Component | Version / revision | License |
|---|---|---|
| Dust Wave native speech and Apple adapters | Exact `shared/dust-wave-platform` gitlink | MIT, retaining original Record attribution |
| Dust Wave timed-text | 0.11.1; same exact Platform gitlink | MIT |
| FluidAudio | 0.15.5, 19600a485baa4998812e4654b70d2bab8f2c9949 | Apache-2.0 |
| Sparkle updater | 2.9.6, locked in macos/Package.resolved | MIT, resources/licenses/Sparkle-LICENSE.txt |
| Node.js | 24.19.0 | Node contributors license, runtime/LICENSE.Node |
| FFmpeg | 8.1.2 | LGPL-2.1-or-later, runtime/COPYING.LGPLv2.1 |
| CPython | 3.11.15, python-build-standalone 20260602 | PSF, bundled Python LICENSE.txt |
| ffsubsync | 0.4.29 | MIT, bundled dist-info/LICENSE |
| WebRTC VAD Python wrappers | 2.0.10 / wheels 2.0.14 | MIT and bundled WebRTC notices |
| NumPy and other Python dependencies | requirements-sync.lock | bundled dist-info license files |

FluidAudio's fastcluster/VBx notices and previously included Sparkle/ArgumentParser notices are retained conservatively. The speech executable directly uses DustWaveSpeech; no speaker-diarization model is bundled. Platform and original Record MIT texts are included beside the bundled shared package.

The app reuses Podcast Visualizer's exact verified Node and FFmpeg runtime. Source URLs, source archive hashes, build flags and pre-signing binary hashes are recorded in the runtime manifests. FFmpeg disables networking, GPL and nonfree components. Its bundled dynamic text-rendering libraries retain their upstream licenses in the runtime notice directory. For redistribution, retain corresponding FFmpeg/LGPL library source and rebuild instructions from Podcast Visualizer's runtime build scripts; do not treat an ad-hoc development app as a distribution compliance artifact.

Model weights are downloaded or imported separately, never included in the app. NVIDIA Parakeet TDT v3 and Fluid Inference's Core ML conversion are attributed here. The [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) declares CC BY 4.0. The [pinned Core ML card](https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml/tree/aed02740059203c4a87495924f685de3722ae9ce) declares CC BY 4.0 in its metadata, while its prose license section refers to the Apache-2.0 software library. Record's pinned file manifest identifies the exact conversion used. See the [CC BY 4.0 terms](https://creativecommons.org/licenses/by/4.0/) and the upstream cards before redistribution. Auto Subtitle does not modify the imported model files.

The original icon was generated for this project; canonical artwork and reproduction notes are in `resources/app-icon/`.

Development-only Jev evaluation reuses Dust Wave Test Core 0.3.0 (MIT) at the same platform commit. Test Core is not bundled with the app. The platform pin is merged; timed-text's files are unchanged from the previous pin. Apple formatting uses system frameworks and the bundled app-owned helper. Cloudflare-hosted Jev is an optional developer service, not an app model dependency.
## Language repair

The optional language repair runtime is whisper.cpp 1.9.3, commit `371b5a7561823ab2bb32142d2751e35e7534727b`, built locally with static ggml and an embedded Metal library. License: MIT; see `resources/licenses/whisper.cpp-MIT.txt`. Source: https://github.com/ggml-org/whisper.cpp.

The optional Whisper large-v3-turbo weights are downloaded or reused separately under the MIT license. Publisher conversion: `ggerganov/whisper.cpp`, pinned in `resources/model-manifests/whisper-turbo.json`; original model: https://huggingface.co/openai/whisper-large-v3-turbo. Model files are not included in the app or repository.
