import Foundation
#if canImport(WebRTC)
@preconcurrency import WebRTC
#endif

#if canImport(WebRTC)
/// Extracts video frames from an RTCVideoTrack by acting as an RTCVideoRenderer.
/// Converts incoming RTCVideoFrame objects to CVPixelBuffer and delivers them via a callback.
/// Throttles delivery to approximately 5fps (every 6th frame at 30fps source).
final class WebRTCFrameExtractor: NSObject, RTCVideoRenderer {

    /// Called on every extracted frame with the CVPixelBuffer ready for Vision analysis.
    var onFrame: ((CVPixelBuffer) -> Void)?

    /// Number of frames to skip between deliveries. At 30fps source, 6 yields ~5fps.
    private let deliverEveryNFrames: Int
    private var frameCounter = 0

    /// The track this extractor is currently attached to.
    private(set) weak var attachedTrack: RTCVideoTrack?

    // MARK: - Init

    /// - Parameter deliverEveryNFrames: Deliver one frame for every N received. Default 6 (~5fps at 30fps source).
    init(deliverEveryNFrames: Int = 6) {
        self.deliverEveryNFrames = max(1, deliverEveryNFrames)
        super.init()
    }

    // MARK: - Attach / Detach

    /// Attach this extractor as a renderer on the given video track.
    /// Automatically detaches from any previously attached track.
    func attach(to track: RTCVideoTrack) {
        detach()
        track.add(self)
        attachedTrack = track
        frameCounter = 0
        print("[WebRTCFrameExtractor] Attached to remote video track")
    }

    /// Detach from the currently attached track.
    func detach() {
        if let track = attachedTrack {
            track.remove(self)
            print("[WebRTCFrameExtractor] Detached from remote video track")
        }
        attachedTrack = nil
        frameCounter = 0
    }

    // MARK: - RTCVideoRenderer

    func setSize(_ size: CGSize) {
        // No-op — we don't need to resize anything for analysis.
    }

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame else { return }

        frameCounter += 1
        guard frameCounter >= deliverEveryNFrames else { return }
        frameCounter = 0

        guard let pixelBuffer = extractPixelBuffer(from: frame) else { return }
        onFrame?(pixelBuffer)
    }

    // MARK: - Pixel Buffer Extraction

    /// Extract a CVPixelBuffer from an RTCVideoFrame.
    /// Handles both RTCCVPixelBuffer (direct access) and I420 buffer types (conversion).
    private func extractPixelBuffer(from frame: RTCVideoFrame) -> CVPixelBuffer? {
        let buffer = frame.buffer

        // Fast path: RTCCVPixelBuffer wraps a CVPixelBuffer directly
        if let cvPixelBuffer = buffer as? RTCCVPixelBuffer {
            return cvPixelBuffer.pixelBuffer
        }

        // Slow path: Convert any buffer to I420, then to CVPixelBuffer
        let i420 = buffer.toI420()
        return convertI420ToPixelBuffer(i420, width: Int(frame.width), height: Int(frame.height))
    }

    /// Convert an I420 buffer to a CVPixelBuffer by copying Y/U/V planes into a BGRA pixel buffer.
    /// This is the fallback path for non-CVPixelBuffer frames (e.g., software-decoded video).
    private func convertI420ToPixelBuffer(_ i420: any RTCI420BufferProtocol, width: Int, height: Int) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any]
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            attrs as CFDictionary,
            &pixelBuffer
        )

        guard status == kCVReturnSuccess, let output = pixelBuffer else { return nil }

        CVPixelBufferLockBaseAddress(output, [])
        defer { CVPixelBufferUnlockBaseAddress(output, []) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(output) else { return nil }

        let bytesPerRow = CVPixelBufferGetBytesPerRow(output)
        let dst = baseAddress.assumingMemoryBound(to: UInt8.self)

        // Convert I420 (YUV planar) to BGRA
        let yPlane = i420.dataY
        let uPlane = i420.dataU
        let vPlane = i420.dataV
        let yStride = Int(i420.strideY)
        let uStride = Int(i420.strideU)
        let vStride = Int(i420.strideV)

        for row in 0..<height {
            for col in 0..<width {
                let yIndex = row * yStride + col
                let uvRow = row / 2
                let uvCol = col / 2
                let uIndex = uvRow * uStride + uvCol
                let vIndex = uvRow * vStride + uvCol

                let y = Double(yPlane[yIndex])
                let u = Double(uPlane[uIndex]) - 128.0
                let v = Double(vPlane[vIndex]) - 128.0

                let r = y + 1.402 * v
                let g = y - 0.344136 * u - 0.714136 * v
                let b = y + 1.772 * u

                let pixelOffset = row * bytesPerRow + col * 4
                dst[pixelOffset + 0] = UInt8(clamping: Int(b.rounded()))  // B
                dst[pixelOffset + 1] = UInt8(clamping: Int(g.rounded()))  // G
                dst[pixelOffset + 2] = UInt8(clamping: Int(r.rounded()))  // R
                dst[pixelOffset + 3] = 255                                 // A
            }
        }

        return output
    }
}
#endif
