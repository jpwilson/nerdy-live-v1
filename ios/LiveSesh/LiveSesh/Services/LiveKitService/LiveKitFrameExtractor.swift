import Foundation
import CoreVideo
#if canImport(LiveKit)
import LiveKit
#endif

#if canImport(LiveKit)
/// Extracts video frames from a LiveKit VideoTrack for analysis.
/// Throttles delivery to approximately 5fps (every 6th frame at 30fps source).
final class LiveKitFrameExtractor: NSObject, VideoRenderer {
    /// Called on every extracted frame with the CVPixelBuffer ready for Vision analysis.
    var onFrame: ((CVPixelBuffer) -> Void)?

    private let deliverEveryNFrames: Int
    private var frameCounter = 0
    private weak var attachedTrack: VideoTrack?

    init(deliverEveryNFrames: Int = 6) {
        self.deliverEveryNFrames = max(1, deliverEveryNFrames)
        super.init()
    }

    func attach(to track: VideoTrack) {
        detach()
        track.add(videoRenderer: self)
        attachedTrack = track
        frameCounter = 0
        print("[LiveKitFrameExtractor] Attached to video track")
    }

    func detach() {
        if let track = attachedTrack {
            track.remove(videoRenderer: self)
            print("[LiveKitFrameExtractor] Detached from video track")
        }
        attachedTrack = nil
        frameCounter = 0
    }

    // MARK: - VideoRenderer

    func setSize(_ size: CGSize) {
        // No-op
    }

    func renderFrame(_ frame: VideoFrame) {
        frameCounter += 1
        guard frameCounter >= deliverEveryNFrames else { return }
        frameCounter = 0

        guard let pixelBuffer = frame.toCVPixelBuffer() else { return }
        onFrame?(pixelBuffer)
    }

    var isAdaptiveStreamEnabled: Bool { true }

    var adaptiveStreamSize: CGSize { CGSize(width: 320, height: 240) }
}
#endif
