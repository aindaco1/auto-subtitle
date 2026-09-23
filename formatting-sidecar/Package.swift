// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AutoSubtitleFormatting", platforms: [.macOS(.v15)],
    products: [.executable(name: "auto-subtitle-format", targets: ["AutoSubtitleFormatting"])],
    dependencies: [.package(path: "../shared/dust-wave-platform/native")],
    targets: [.executableTarget(
        name: "AutoSubtitleFormatting",
        dependencies: [.product(name: "DustWaveAppleIntelligence", package: "native")],
        path: ".", exclude: ["Package.swift"], sources: ["AppleSubtitleFormatter.swift"]
    )]
)
