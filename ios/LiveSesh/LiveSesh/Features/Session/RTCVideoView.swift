import SwiftUI
import WebRTC

#if os(iOS)
/// A SwiftUI wrapper around RTCMTLVideoView for rendering WebRTC video tracks.
struct RTCVideoViewRepresentable: UIViewRepresentable {
    let videoTrack: RTCVideoTrack?

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.videoContentMode = .scaleAspectFill
        view.clipsToBounds = true
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
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
