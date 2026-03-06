import XCTest
import Combine
@testable import LiveSesh

final class VideoProcessorTests: XCTestCase {
    var processor: VideoProcessor!
    var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        processor = VideoProcessor(analyzeEveryNFrames: 1)
        cancellables = Set<AnyCancellable>()
    }

    override func tearDown() {
        processor.stopProcessing()
        processor = nil
        cancellables = nil
        super.tearDown()
    }

    // MARK: - Lifecycle

    func testStartProcessingSetsFlag() {
        XCTAssertFalse(processor.isProcessing)
        processor.startProcessing()
        XCTAssertTrue(processor.isProcessing)
    }

    func testStopProcessingClearsFlag() {
        processor.startProcessing()
        processor.stopProcessing()
        XCTAssertFalse(processor.isProcessing)
    }

    // MARK: - Face Detection Output Models

    func testFaceDetectionResultEmpty() {
        let result = FaceDetectionResult.empty
        XCTAssertEqual(result.faceCount, 0)
        XCTAssertTrue(result.faces.isEmpty)
    }

    func testFaceDetectionResultWithFaces() {
        let face = DetectedFace(
            id: UUID(),
            boundingBox: CGRect(x: 0.2, y: 0.2, width: 0.6, height: 0.6),
            landmarks: nil,
            confidence: 0.95
        )
        let result = FaceDetectionResult(faceCount: 1, faces: [face], timestamp: Date())
        XCTAssertEqual(result.faceCount, 1)
        XCTAssertEqual(result.faces.first?.confidence, 0.95)
    }

    // MARK: - Gaze Estimation Models

    func testGazeEstimationEmpty() {
        let gaze = GazeEstimation.empty
        XCTAssertFalse(gaze.isLookingAtCamera)
        XCTAssertEqual(gaze.gazeDirection, .unknown)
        XCTAssertEqual(gaze.confidence, 0)
    }

    func testGazeAtCamera() {
        let gaze = GazeEstimation(
            isLookingAtCamera: true,
            gazeDirection: .atCamera,
            confidence: 0.9,
            yaw: 0.05, pitch: 0.03,
            timestamp: Date()
        )
        XCTAssertTrue(gaze.isLookingAtCamera)
        XCTAssertEqual(gaze.gazeDirection, .atCamera)
    }

    func testGazeDirectionEquality() {
        XCTAssertEqual(GazeDirection.atCamera, GazeDirection.atCamera)
        XCTAssertNotEqual(GazeDirection.left, GazeDirection.right)
    }

    // MARK: - Facial Expression Models

    func testNeutralExpression() {
        let expr = FacialExpression.neutral
        XCTAssertEqual(expr.valence, 0)
        XCTAssertEqual(expr.dominantExpression, .neutral)
    }

    func testHappyExpressionHasPositiveValence() {
        let expr = FacialExpression(
            valence: 0.7,
            arousal: 0.6,
            dominantExpression: .happy,
            timestamp: Date()
        )
        XCTAssertGreaterThan(expr.valence, 0)
        XCTAssertEqual(expr.dominantExpression, .happy)
    }

    // MARK: - Frame Skip

    func testFrameSkipConfiguration() {
        let processor1 = VideoProcessor(analyzeEveryNFrames: 6)
        XCTAssertNotNil(processor1)

        let processor2 = VideoProcessor(analyzeEveryNFrames: 0) // Should clamp to 1
        XCTAssertNotNil(processor2)
    }

    // MARK: - Publisher Existence

    func testPublishersExist() {
        XCTAssertNotNil(processor.faceDetectionPublisher)
        XCTAssertNotNil(processor.gazeEstimationPublisher)
        XCTAssertNotNil(processor.expressionPublisher)
    }
}

// MARK: - Face Landmarks Tests

final class FaceLandmarksTests: XCTestCase {
    func testLandmarksEquality() {
        let landmarks1 = FaceLandmarks(
            leftEyeCenter: CGPoint(x: 0.3, y: 0.6),
            rightEyeCenter: CGPoint(x: 0.7, y: 0.6),
            noseTip: CGPoint(x: 0.5, y: 0.5),
            mouthCenter: CGPoint(x: 0.5, y: 0.3),
            faceContour: []
        )
        let landmarks2 = FaceLandmarks(
            leftEyeCenter: CGPoint(x: 0.3, y: 0.6),
            rightEyeCenter: CGPoint(x: 0.7, y: 0.6),
            noseTip: CGPoint(x: 0.5, y: 0.5),
            mouthCenter: CGPoint(x: 0.5, y: 0.3),
            faceContour: []
        )
        XCTAssertEqual(landmarks1, landmarks2)
    }

    func testLandmarksInequality() {
        let landmarks1 = FaceLandmarks(
            leftEyeCenter: CGPoint(x: 0.3, y: 0.6),
            rightEyeCenter: CGPoint(x: 0.7, y: 0.6),
            noseTip: CGPoint(x: 0.5, y: 0.5),
            mouthCenter: CGPoint(x: 0.5, y: 0.3),
            faceContour: []
        )
        let landmarks2 = FaceLandmarks(
            leftEyeCenter: CGPoint(x: 0.4, y: 0.6),
            rightEyeCenter: CGPoint(x: 0.7, y: 0.6),
            noseTip: CGPoint(x: 0.5, y: 0.5),
            mouthCenter: CGPoint(x: 0.5, y: 0.3),
            faceContour: []
        )
        XCTAssertNotEqual(landmarks1, landmarks2)
    }
}
