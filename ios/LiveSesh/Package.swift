// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LiveSesh",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "LiveSesh", targets: ["LiveSesh"]),
    ],
    targets: [
        .target(
            name: "LiveSesh",
            path: "LiveSesh",
            exclude: ["App/LiveSeshApp.swift"]  // App entry point excluded from library
        ),
        .testTarget(
            name: "LiveSeshTests",
            dependencies: ["LiveSesh"],
            path: "LiveSeshTests"
        ),
    ]
)
