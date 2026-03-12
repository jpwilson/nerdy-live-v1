import SwiftUI
import WebRTC

#if os(iOS)
import UIKit

/// A SwiftUI wrapper around RTCMTLVideoView for rendering WebRTC video tracks.
struct RTCVideoViewRepresentable: UIViewRepresentable {
    let videoTrack: RTCVideoTrack?
    var fill: Bool = false      // false = aspectFit (show full frame), true = aspectFill (crop to fill)
    var mirrored: Bool = false  // true = horizontal flip (for local self-preview, like a mirror)

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.videoContentMode = fill ? .scaleAspectFill : .scaleAspectFit
        view.clipsToBounds = true
        view.backgroundColor = .black
        if mirrored {
            view.transform = CGAffineTransform(scaleX: -1, y: 1)
        }
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        // Update content mode in case it changed
        let mode: UIView.ContentMode = fill ? .scaleAspectFill : .scaleAspectFit
        if uiView.videoContentMode != mode {
            uiView.videoContentMode = mode
        }

        // Update mirror transform
        let expectedTransform = mirrored
            ? CGAffineTransform(scaleX: -1, y: 1)
            : .identity
        if uiView.transform != expectedTransform {
            uiView.transform = expectedTransform
        }

        // Remove old track binding
        context.coordinator.currentTrack?.remove(uiView)

        // Add new track
        if let track = videoTrack {
            track.add(uiView)
        }
        context.coordinator.currentTrack = videoTrack
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.currentTrack?.remove(uiView)
    }

    class Coordinator {
        var currentTrack: RTCVideoTrack?
    }
}
#endif
