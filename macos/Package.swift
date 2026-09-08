// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "AutoSubtitle", platforms: [.macOS(.v15)],
    products: [.executable(name: "AutoSubtitle", targets: ["AutoSubtitleApp"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6")],
    targets: [.target(name: "AutoSubtitleCore"),
              .executableTarget(name: "AutoSubtitleApp", dependencies: ["AutoSubtitleCore", .product(name: "Sparkle", package: "Sparkle")],
                linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
              .testTarget(name: "AutoSubtitleCoreTests", dependencies: ["AutoSubtitleCore"])])
