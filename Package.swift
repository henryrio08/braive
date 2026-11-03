// swift-tools-version: 6.0

import PackageDescription

// xtool builds this library product as the iOS app. The Xcode project remains
// available for Henry's native builds; both use the same Swift source tree.
let package = Package(
  name: "Braive",
  platforms: [.iOS(.v18), .macOS(.v14)],
  products: [.library(name: "Braive", targets: ["Braive"])],
  dependencies: [
    .package(url: "https://github.com/warrenm/GLTFKit2.git", exact: "0.5.15"),
  ],
  targets: [
    .target(
      name: "Braive",
      dependencies: [.product(name: "GLTFKit2", package: "GLTFKit2")],
      path: "ios/Braive",
      exclude: ["Assets.xcassets", "Audio", "Info.plist", "Resources"],
      resources: [.copy("Stereo.metal")]
    ),
  ],
  swiftLanguageModes: [.v5]
)
