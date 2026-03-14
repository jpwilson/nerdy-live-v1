import SwiftUI
#if canImport(LiveKit)
import LiveKit
#endif

#if os(iOS) && canImport(LiveKit)
/// A SwiftUI wrapper for rendering LiveKit video tracks.
struct LiveKitVideoViewRepresentable: UIViewRepresentable {
    let videoTrack: VideoTrack?
    var fill: Bool = false
    var mirrored: Bool = false

    func makeUIView(context: Context) -> VideoView {
        let view = VideoView()
        view.layoutMode = fill ? .fill : .fit
        view.clipsToBounds = true
        view.backgroundColor = .black
        if mirrored {
            view.transform = CGAffineTransform(scaleX: -1, y: 1)
        }
        return view
    }

    func updateUIView(_ uiView: VideoView, context: Context) {
        let mode: VideoView.LayoutMode = fill ? .fill : .fit
        if uiView.layoutMode != mode {
            uiView.layoutMode = mode
        }

        let expectedTransform = mirrored
            ? CGAffineTransform(scaleX: -1, y: 1)
            : .identity
        if uiView.transform != expectedTransform {
            uiView.transform = expectedTransform
        }

        // Update track
        uiView.track = videoTrack
    }
}
#endif
