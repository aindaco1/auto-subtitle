// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "AutoSubtitleSpeech", platforms: [.macOS(.v15)],
    products: [.executable(name: "auto-subtitle-speech", targets: ["AutoSubtitleSpeech"])],
    dependencies: [.package(path: "../shared/record")],
    targets: [.executableTarget(name: "AutoSubtitleSpeech", dependencies: [
        .product(name: "RecordSpeech", package: "Record")
    ])]
)
