// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "AutoSubtitle", platforms: [.macOS(.v15)],
    products: [.executable(name: "AutoSubtitle", targets: ["AutoSubtitleApp"])],
    dependencies: [
        .package(path: "../shared/dust-wave-platform/desktop"),.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6")],
    targets: [.target(name: "AutoSubtitleCore", dependencies: [.product(name: "DustWaveUpdatePolicy", package: "desktop")]),
              .executableTarget(name: "AutoSubtitleApp", dependencies: ["AutoSubtitleCore", .product(name: "DustWaveUpdates", package: "desktop")],
                linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
              .testTarget(name: "AutoSubtitleCoreTests", dependencies: ["AutoSubtitleCore"])])
