import Foundation
import AVFoundation
import Vision
import Combine

protocol VideoProcessorProtocol: AnyObject {
    var faceDetectionPublisher: AnyPublisher<FaceDetectionResult, Never> { get }
    var gazeEstimationPublisher: AnyPublisher<GazeEstimation, Never> { get }
    var expressionPublisher: AnyPublisher<FacialExpression, Never> { get }
    var isProcessing: Bool { get }

    func startProcessing()
    func stopProcessing()
    func processFrame(_ sampleBuffer: CMSampleBuffer)
    func processPixelBuffer(_ pixelBuffer: CVPixelBuffer)
}

// MARK: - Output Models

struct FaceDetectionResult: Equatable {
    let faceCount: Int
    let faces: [DetectedFace]
    let timestamp: Date

    static let empty = FaceDetectionResult(faceCount: 0, faces: [], timestamp: Date())
}

struct DetectedFace: Equatable {
    let id: UUID
    let boundingBox: CGRect
    let landmarks: FaceLandmarks?
    let confidence: Float
}

struct FaceLandmarks: Equatable {
    let leftEyeCenter: CGPoint
    let rightEyeCenter: CGPoint
    let noseTip: CGPoint
    let mouthCenter: CGPoint
    let faceContour: [CGPoint]

    // Full point arrays for mesh overlay
    let leftEyePoints: [CGPoint]
    let rightEyePoints: [CGPoint]
    let leftEyebrowPoints: [CGPoint]
    let rightEyebrowPoints: [CGPoint]
    let nosePoints: [CGPoint]
    let noseCrestPoints: [CGPoint]
    let innerLipsPoints: [CGPoint]
    let outerLipsPoints: [CGPoint]
    let medianLinePoints: [CGPoint]
}

struct GazeEstimation: Equatable {
    let isLookingAtCamera: Bool
    let gazeDirection: GazeDirection
    let confidence: Double
    let yaw: Double
    let pitch: Double
    let timestamp: Date

    static let empty = GazeEstimation(
        isLookingAtCamera: false,
        gazeDirection: .unknown,
        confidence: 0,
        yaw: 0, pitch: 0,
        timestamp: Date()
    )
}

enum GazeDirection: String, Equatable {
    case atCamera
    case left
    case right
    case up
    case down
    case away
    case unknown
}

struct FacialExpression: Equatable {
    let valence: Double // -1 (negative) to 1 (positive)
    let arousal: Double // 0 (calm) to 1 (excited)
    let dominantExpression: ExpressionType
    let timestamp: Date

    static let neutral = FacialExpression(
        valence: 0, arousal: 0.5,
        dominantExpression: .neutral, timestamp: Date()
    )
}

enum ExpressionType: String, Equatable {
    case happy, neutral, confused, bored, surprised, focused
}

// MARK: - Video Processor Implementation

final class VideoProcessor: VideoProcessorProtocol {
    private let faceDetectionSubject = PassthroughSubject<FaceDetectionResult, Never>()
    private let gazeEstimationSubject = PassthroughSubject<GazeEstimation, Never>()
    private let expressionSubject = PassthroughSubject<FacialExpression, Never>()

    var faceDetectionPublisher: AnyPublisher<FaceDetectionResult, Never> {
        faceDetectionSubject.eraseToAnyPublisher()
    }
    var gazeEstimationPublisher: AnyPublisher<GazeEstimation, Never> {
        gazeEstimationSubject.eraseToAnyPublisher()
    }
    var expressionPublisher: AnyPublisher<FacialExpression, Never> {
        expressionSubject.eraseToAnyPublisher()
    }

    private(set) var isProcessing = false
    private let processingQueue = DispatchQueue(label: "com.livesesh.videoprocessor", qos: .userInteractive)
    private var frameSkipCounter = 0
    private let analyzeEveryNFrames: Int

    /// Frames to skip between analyses. At 30fps, analyzeEveryNFrames=6 gives ~5fps analysis rate.
    init(analyzeEveryNFrames: Int = 6) {
        self.analyzeEveryNFrames = max(1, analyzeEveryNFrames)
    }

    func startProcessing() {
        isProcessing = true
        frameSkipCounter = 0
    }

    func stopProcessing() {
        isProcessing = false
    }

    func processFrame(_ sampleBuffer: CMSampleBuffer) {
        guard isProcessing else { return }

        frameSkipCounter += 1
        guard frameSkipCounter >= analyzeEveryNFrames else { return }
        frameSkipCounter = 0

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        processingQueue.async { [weak self] in
            self?.runFaceDetection(on: pixelBuffer)
        }
    }

    func processPixelBuffer(_ pixelBuffer: CVPixelBuffer) {
        guard isProcessing else { return }

        frameSkipCounter += 1
        guard frameSkipCounter >= analyzeEveryNFrames else { return }
        frameSkipCounter = 0

        processingQueue.async { [weak self] in
            self?.runFaceDetection(on: pixelBuffer)
        }
    }

    private func runFaceDetection(on pixelBuffer: CVPixelBuffer) {
        let request = VNDetectFaceLandmarksRequest { [weak self] request, error in
            guard error == nil,
                  let observations = request.results as? [VNFaceObservation] else {
                self?.faceDetectionSubject.send(.empty)
                return
            }

            let faces = observations.map { observation -> DetectedFace in
                let landmarks = self?.extractLandmarks(from: observation)
                return DetectedFace(
                    id: observation.uuid,
                    boundingBox: observation.boundingBox,
                    landmarks: landmarks,
                    confidence: observation.confidence
                )
            }

            let result = FaceDetectionResult(
                faceCount: faces.count,
                faces: faces,
                timestamp: Date()
            )

            self?.faceDetectionSubject.send(result)

            // Estimate gaze from face observation
            if let primaryFace = observations.first {
                self?.estimateGaze(from: primaryFace)
                self?.analyzeExpression(from: primaryFace)
            }
        }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        try? handler.perform([request])
    }

    private func extractLandmarks(from observation: VNFaceObservation) -> FaceLandmarks? {
        guard let landmarks = observation.landmarks else { return nil }

        let leftEyeAll = landmarks.leftEye?.normalizedPoints ?? []
        let rightEyeAll = landmarks.rightEye?.normalizedPoints ?? []
        let noseAll = landmarks.nose?.normalizedPoints ?? []
        let innerLipsAll = landmarks.innerLips?.normalizedPoints ?? []
        let outerLipsAll = landmarks.outerLips?.normalizedPoints ?? []
        let contour = landmarks.faceContour?.normalizedPoints ?? []

        return FaceLandmarks(
            leftEyeCenter: leftEyeAll.first ?? .zero,
            rightEyeCenter: rightEyeAll.first ?? .zero,
            noseTip: noseAll.first ?? .zero,
            mouthCenter: innerLipsAll.first ?? .zero,
            faceContour: contour,
            leftEyePoints: leftEyeAll,
            rightEyePoints: rightEyeAll,
            leftEyebrowPoints: landmarks.leftEyebrow?.normalizedPoints ?? [],
            rightEyebrowPoints: landmarks.rightEyebrow?.normalizedPoints ?? [],
            nosePoints: noseAll,
            noseCrestPoints: landmarks.noseCrest?.normalizedPoints ?? [],
            innerLipsPoints: innerLipsAll,
            outerLipsPoints: outerLipsAll,
            medianLinePoints: landmarks.medianLine?.normalizedPoints ?? []
        )
    }

    private func estimateGaze(from observation: VNFaceObservation) {
        let yaw = observation.yaw?.doubleValue ?? 0
        let pitch = observation.pitch?.doubleValue ?? 0

        let yawThreshold = 0.15
        let pitchThreshold = 0.15

        let isLookingAtCamera = abs(yaw) < yawThreshold && abs(pitch) < pitchThreshold

        let direction: GazeDirection
        if isLookingAtCamera {
            direction = .atCamera
        } else if yaw > yawThreshold {
            direction = .left
        } else if yaw < -yawThreshold {
            direction = .right
        } else if pitch > pitchThreshold {
            direction = .up
        } else if pitch < -pitchThreshold {
            direction = .down
        } else {
            direction = .away
        }

        let confidence = max(0, 1.0 - (abs(yaw) + abs(pitch)))

        let gaze = GazeEstimation(
            isLookingAtCamera: isLookingAtCamera,
            gazeDirection: direction,
            confidence: confidence,
            yaw: yaw,
            pitch: pitch,
            timestamp: Date()
        )

        gazeEstimationSubject.send(gaze)
    }

    private func analyzeExpression(from observation: VNFaceObservation) {
        // Use landmarks to infer basic expression
        guard let landmarks = observation.landmarks,
              let innerLips = landmarks.innerLips?.normalizedPoints,
              let outerLips = landmarks.outerLips?.normalizedPoints else {
            expressionSubject.send(.neutral)
            return
        }

        // Simple smile detection: mouth width vs height ratio
        let mouthWidth = outerLips.map(\.x).max()! - outerLips.map(\.x).min()!
        let mouthHeight = outerLips.map(\.y).max()! - outerLips.map(\.y).min()!
        let mouthRatio = mouthWidth / max(mouthHeight, 0.001)

        // Inner lip openness
        let innerHeight = innerLips.map(\.y).max()! - innerLips.map(\.y).min()!

        let valence: Double
        let expression: ExpressionType

        if mouthRatio > 3.0 {
            valence = 0.7
            expression = .happy
        } else if innerHeight > 0.02 && mouthRatio < 2.0 {
            valence = -0.3
            expression = .surprised
        } else if mouthRatio < 1.5 {
            valence = -0.2
            expression = .confused
        } else {
            valence = 0.0
            expression = .neutral
        }

        let arousal = min(1.0, abs(valence) + 0.3)

        let result = FacialExpression(
            valence: valence,
            arousal: arousal,
            dominantExpression: expression,
            timestamp: Date()
        )

        expressionSubject.send(result)
    }
}
