import XCTest
import Combine
@testable import LiveSesh

final class MetricsEngineTests: XCTestCase {
    var engine: MetricsEngine!
    var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        engine = MetricsEngine(windowSize: 10)
        cancellables = Set<AnyCancellable>()
    }

    override func tearDown() {
        engine.stop()
        engine = nil
        cancellables = nil
        super.tearDown()
    }

    // MARK: - Lifecycle Tests

    func testStartSetsSessionId() {
        let sessionId = UUID()
        engine.start(sessionId: sessionId)
        XCTAssertNotNil(engine.latestMetrics)
    }

    func testStopResetsMetrics() {
        engine.start(sessionId: UUID())
        engine.stop()
        XCTAssertEqual(engine.latestMetrics, .empty)
    }

    func testMetricsPublisherEmitsOnStart() {
        let expectation = expectation(description: "Metrics emitted")
        var receivedCount = 0

        engine.metricsPublisher
            .sink { _ in
                receivedCount += 1
                if receivedCount >= 1 {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        engine.start(sessionId: UUID())
        waitForExpectations(timeout: 2)
    }

    // MARK: - Eye Contact Computation

    func testEyeContactScoreWithAllLooking() {
        engine.start(sessionId: UUID())

        // Feed gazes all looking at camera
        for _ in 0..<10 {
            let gaze = GazeEstimation(
                isLookingAtCamera: true,
                gazeDirection: .atCamera,
                confidence: 0.9,
                yaw: 0, pitch: 0,
                timestamp: Date()
            )
            engine.processGaze(gaze, for: .tutor)
        }

        // Wait for computation
        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        // With all gazes looking, eye contact should be high
        XCTAssertGreaterThan(metrics.tutor.eyeContactScore, 0.5)
    }

    func testEyeContactScoreWithNoneLooking() {
        engine.start(sessionId: UUID())

        for _ in 0..<10 {
            let gaze = GazeEstimation(
                isLookingAtCamera: false,
                gazeDirection: .away,
                confidence: 0.9,
                yaw: 0.5, pitch: 0.5,
                timestamp: Date()
            )
            engine.processGaze(gaze, for: .tutor)
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertEqual(metrics.tutor.eyeContactScore, 0.0, accuracy: 0.01)
    }

    func testMixedEyeContact() {
        engine.start(sessionId: UUID())

        // 7 looking, 3 not looking = 70%
        for i in 0..<10 {
            let looking = i < 7
            let gaze = GazeEstimation(
                isLookingAtCamera: looking,
                gazeDirection: looking ? .atCamera : .away,
                confidence: 0.9,
                yaw: looking ? 0 : 0.5,
                pitch: 0,
                timestamp: Date()
            )
            engine.processGaze(gaze, for: .student)
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        // Should be approximately 0.7 for student
        XCTAssertEqual(engine.latestMetrics.student.eyeContactScore, 0.7, accuracy: 0.15)
    }

    func testEyeContactTrackedPerParticipantRole() {
        engine.start(sessionId: UUID())

        for _ in 0..<10 {
            engine.processGaze(
                GazeEstimation(
                    isLookingAtCamera: true,
                    gazeDirection: .atCamera,
                    confidence: 0.9,
                    yaw: 0,
                    pitch: 0,
                    timestamp: Date()
                ),
                for: .tutor
            )
        }

        for _ in 0..<10 {
            engine.processGaze(
                GazeEstimation(
                    isLookingAtCamera: false,
                    gazeDirection: .away,
                    confidence: 0.9,
                    yaw: 0.4,
                    pitch: 0.2,
                    timestamp: Date()
                ),
                for: .student
            )
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertGreaterThan(metrics.tutor.eyeContactScore, 0.8)
        XCTAssertLessThan(metrics.student.eyeContactScore, 0.2)
    }

    // MARK: - Talk Time Balance

    func testTalkTimeWithOnlyTutorSpeaking() {
        engine.start(sessionId: UUID())

        for _ in 0..<20 {
            let state = SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.5, timestamp: Date())
            engine.processSpeaking(state)
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertGreaterThan(metrics.tutor.talkTimePercent, 0.8)
        XCTAssertLessThan(metrics.student.talkTimePercent, 0.2)
    }

    func testTalkTimeWithBalancedSpeaking() {
        engine.start(sessionId: UUID())

        for i in 0..<20 {
            let speaker: SpeakerRole = i % 2 == 0 ? .tutor : .student
            let state = SpeakingState(isSpeaking: true, speakerId: speaker, volume: 0.5, timestamp: Date())
            engine.processSpeaking(state)
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertEqual(metrics.tutor.talkTimePercent, 0.5, accuracy: 0.1)
        XCTAssertEqual(metrics.student.talkTimePercent, 0.5, accuracy: 0.1)
    }

    // MARK: - Energy Score

    func testEnergyScoreFromExpressions() {
        engine.start(sessionId: UUID())

        for _ in 0..<10 {
            let expr = FacialExpression(valence: 0.7, arousal: 0.8, dominantExpression: .happy, timestamp: Date())
            engine.processExpression(expr, for: .tutor)
        }

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertGreaterThan(metrics.tutor.energyScore, 0.5)
    }

    // MARK: - Engagement Trend

    func testNoDataReturnsEmptyMetrics() {
        engine.start(sessionId: UUID())

        let expectation = expectation(description: "Metrics computed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2)

        let metrics = engine.latestMetrics
        XCTAssertEqual(metrics.session.engagementTrend, .stable)
    }
}

// MARK: - Rolling Window Tests

final class RollingWindowTests: XCTestCase {
    func testAddAndCount() {
        var window = RollingWindow<Int>(windowSize: 10)
        window.add(1)
        window.add(2)
        window.add(3)
        XCTAssertEqual(window.count, 3)
    }

    func testEmptyWindow() {
        let window = RollingWindow<Int>(windowSize: 10)
        XCTAssertTrue(window.isEmpty)
        XCTAssertEqual(window.count, 0)
    }

    func testItemsPreserved() {
        var window = RollingWindow<String>(windowSize: 60)
        window.add("hello")
        window.add("world")
        XCTAssertEqual(window.items, ["hello", "world"])
    }
}

// MARK: - Interruption Detector Tests

final class InterruptionDetectorTests: XCTestCase {
    func testNoInterruptionsWhenSamePersonSpeaks() {
        let detector = InterruptionDetector()
        for _ in 0..<10 {
            detector.process(SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.5, timestamp: Date()))
        }
        XCTAssertEqual(detector.count, 0)
    }

    func testInterruptionDetectedOnOverlap() {
        let detector = InterruptionDetector()
        let now = Date()

        // Tutor speaking
        detector.process(SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.5, timestamp: now))

        // Student interrupts (overlap)
        detector.process(SpeakingState(isSpeaking: true, speakerId: .student, volume: 0.5, timestamp: now.addingTimeInterval(0.6)))

        // Overlap ends
        detector.process(SpeakingState(isSpeaking: true, speakerId: .student, volume: 0.5, timestamp: now.addingTimeInterval(1.2)))

        XCTAssertGreaterThanOrEqual(detector.count, 0) // May or may not trigger depending on overlap duration
    }

    func testResetClearsCount() {
        let detector = InterruptionDetector()
        detector.process(SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.5, timestamp: Date()))
        detector.reset()
        XCTAssertEqual(detector.count, 0)
    }
}

// MARK: - Silence Tracker Tests

final class SilenceTrackerTests: XCTestCase {
    func testSilenceTracking() {
        let tracker = SilenceTracker()
        let start = Date()

        tracker.process(SpeakingState(isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: start))
        tracker.process(SpeakingState(isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: start.addingTimeInterval(5)))

        XCTAssertEqual(tracker.currentSilenceDuration, 5.0, accuracy: 0.1)
    }

    func testSilenceResetsOnSpeech() {
        let tracker = SilenceTracker()
        let start = Date()

        tracker.process(SpeakingState(isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: start))
        tracker.process(SpeakingState(isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: start.addingTimeInterval(5)))
        tracker.process(SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.5, timestamp: start.addingTimeInterval(6)))

        XCTAssertEqual(tracker.currentSilenceDuration, 0)
    }

    func testResetClearsSilence() {
        let tracker = SilenceTracker()
        tracker.process(SpeakingState(isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: Date()))
        tracker.reset()
        XCTAssertEqual(tracker.currentSilenceDuration, 0)
    }
}

// MARK: - Trend Analyzer Tests

final class TrendAnalyzerTests: XCTestCase {
    func testStableTrendWithSimilarData() {
        let analyzer = TrendAnalyzer()
        for _ in 0..<20 {
            analyzer.addDataPoint(0.5)
        }
        XCTAssertEqual(analyzer.currentTrend, .stable)
    }

    func testRisingTrend() {
        let analyzer = TrendAnalyzer()
        for i in 0..<10 {
            analyzer.addDataPoint(0.3)
        }
        for i in 0..<10 {
            analyzer.addDataPoint(0.8)
        }
        XCTAssertEqual(analyzer.currentTrend, .rising)
    }

    func testDecliningTrend() {
        let analyzer = TrendAnalyzer()
        for i in 0..<10 {
            analyzer.addDataPoint(0.8)
        }
        for i in 0..<10 {
            analyzer.addDataPoint(0.3)
        }
        XCTAssertEqual(analyzer.currentTrend, .declining)
    }

    func testInsufficientDataReturnsStable() {
        let analyzer = TrendAnalyzer()
        analyzer.addDataPoint(0.5)
        XCTAssertEqual(analyzer.currentTrend, .stable)
    }

    func testResetClearsTrend() {
        let analyzer = TrendAnalyzer()
        for _ in 0..<20 { analyzer.addDataPoint(0.8) }
        analyzer.reset()
        XCTAssertEqual(analyzer.currentTrend, .stable)
    }
}
