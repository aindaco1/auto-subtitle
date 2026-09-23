// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "AutoSubtitleSpeech", platforms: [.macOS(.v15)],
    products: [.executable(name: "auto-subtitle-speech", targets: ["AutoSubtitleSpeech"])],
    dependencies: [
        .package(path: "../shared/dust-wave-platform/native"),
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.15.5"),
    ],
    targets: [.executableTarget(name: "AutoSubtitleSpeech", dependencies: [
        .product(name: "DustWaveSpeech", package: "native")
    ])]
)
