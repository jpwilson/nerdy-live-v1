import XCTest
import Combine
@testable import LiveSesh

final class CoachingEngineTests: XCTestCase {
    var engine: CoachingEngine!
    var cancellables: Set<AnyCancellable>!
    let sessionId = UUID()

    override func setUp() {
        super.setUp()
        engine = CoachingEngine(config: .default)
        cancellables = Set<AnyCancellable>()
    }

    override func tearDown() {
        engine.stop()
        engine = nil
        cancellables = nil
        super.tearDown()
    }

    // MARK: - Lifecycle

    func testStartEnablesEngine() {
        engine.start(sessionId: sessionId)
        XCTAssertTrue(engine.activeNudges.isEmpty)
    }

    func testStopClearsNudges() {
        engine.start(sessionId: sessionId)
        engine.stop()
        XCTAssertTrue(engine.activeNudges.isEmpty)
    }

    // MARK: - Student Silence Nudge

    func testStudentSilenceTriggersNudge() {
        engine.config.silenceThresholdSeconds = 5 // Short for testing
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Nudge emitted")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .engagementCheck {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        // Simulate student not speaking for longer than threshold
        let now = Date()
        for i in 0..<10 {
            let metrics = makeMetrics(
                studentSpeaking: false,
                timestamp: now.addingTimeInterval(Double(i))
            )
            engine.evaluateMetrics(metrics)
        }

        waitForExpectations(timeout: 2)
    }

    func testStudentSpeakingResetssilenceTimer() {
        engine.config.silenceThresholdSeconds = 100
        engine.start(sessionId: sessionId)

        var nudgeEmitted = false
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .engagementCheck {
                    nudgeEmitted = true
                }
            }
            .store(in: &cancellables)

        // Student speaks, then is silent briefly
        let speakingMetrics = makeMetrics(studentSpeaking: true)
        engine.evaluateMetrics(speakingMetrics)

        let silentMetrics = makeMetrics(studentSpeaking: false)
        engine.evaluateMetrics(silentMetrics)

        XCTAssertFalse(nudgeEmitted)
    }

    // MARK: - Eye Contact Nudge

    func testLowEyeContactTriggersNudge() {
        engine.config.eyeContactThreshold = 0.3
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Attention nudge")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .attentionAlert {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let now = Date()
        for i in 0..<40 {
            let metrics = makeMetrics(
                studentEyeContact: 0.1,
                timestamp: now.addingTimeInterval(Double(i))
            )
            engine.evaluateMetrics(metrics)
        }

        waitForExpectations(timeout: 2)
    }

    func testGoodEyeContactNoNudge() {
        engine.config.eyeContactThreshold = 0.3
        engine.start(sessionId: sessionId)

        var nudgeEmitted = false
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .attentionAlert {
                    nudgeEmitted = true
                }
            }
            .store(in: &cancellables)

        let metrics = makeMetrics(studentEyeContact: 0.8)
        engine.evaluateMetrics(metrics)

        XCTAssertFalse(nudgeEmitted)
    }

    // MARK: - Talk Time Balance Nudge

    func testHighTutorTalkTriggersNudge() {
        engine.config.talkTimeImbalanceThreshold = 0.8
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Talk time nudge")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .talkTimeBalance {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let now = Date()
        for i in 0..<310 { // 5+ minutes
            let metrics = makeMetrics(
                tutorTalkPct: 0.9,
                studentTalkPct: 0.1,
                timestamp: now.addingTimeInterval(Double(i))
            )
            engine.evaluateMetrics(metrics)
        }

        waitForExpectations(timeout: 2)
    }

    // MARK: - Energy Drop Nudge

    func testEnergyDropTriggersNudge() {
        engine.config.energyDropThreshold = 0.2
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Energy nudge")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .energyDrop {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        // First high energy
        let highEnergy = makeMetrics(tutorEnergy: 0.8, studentEnergy: 0.8)
        engine.evaluateMetrics(highEnergy)

        // Then energy drop
        let lowEnergy = makeMetrics(tutorEnergy: 0.3, studentEnergy: 0.3)
        engine.evaluateMetrics(lowEnergy)

        waitForExpectations(timeout: 2)
    }

    // MARK: - Interruption Spike

    func testInterruptionSpikeTriggersNudge() {
        engine.config.interruptionSpikeCount = 3
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Interruption nudge")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .interruptionSpike {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        // First with 0 interruptions
        engine.evaluateMetrics(makeMetrics(interruptions: 0))
        // Then sudden jump to 5
        engine.evaluateMetrics(makeMetrics(interruptions: 5))

        waitForExpectations(timeout: 2)
    }

    // MARK: - Positive Reinforcement

    func testPositiveReinforcementOnHighEngagement() {
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let expectation = expectation(description: "Positive nudge")
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .positiveReinforcement {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let metrics = makeMetrics(
            tutorEyeContact: 0.9,
            studentEyeContact: 0.9,
            tutorEnergy: 0.9,
            studentEnergy: 0.9,
            trend: .rising
        )
        engine.evaluateMetrics(metrics)

        waitForExpectations(timeout: 2)
    }

    // MARK: - Cooldown

    func testCooldownPreventsRepeatedNudges() {
        engine.config.nudgeCooldownSeconds = 120
        engine.config.energyDropThreshold = 0.2
        engine.start(sessionId: sessionId)

        var nudgeCount = 0
        engine.nudgePublisher
            .sink { nudge in
                if nudge.nudgeType == .energyDrop {
                    nudgeCount += 1
                }
            }
            .store(in: &cancellables)

        // Trigger energy drop twice
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.8, studentEnergy: 0.8))
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.3, studentEnergy: 0.3))
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.8, studentEnergy: 0.8))
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.3, studentEnergy: 0.3))

        // Should only trigger once due to cooldown
        XCTAssertLessThanOrEqual(nudgeCount, 1)
    }

    // MARK: - Disabled Nudge Types

    func testDisabledNudgeTypeDontFire() {
        engine.config.enabledNudgeTypes = [] // All disabled
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        var nudgeEmitted = false
        engine.nudgePublisher
            .sink { _ in nudgeEmitted = true }
            .store(in: &cancellables)

        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.8, studentEnergy: 0.8))
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.3, studentEnergy: 0.3))

        XCTAssertFalse(nudgeEmitted)
    }

    // MARK: - Dismiss

    func testDismissNudge() {
        engine.config.nudgeCooldownSeconds = 0
        engine.start(sessionId: sessionId)

        let nudge = CoachingNudge(
            sessionId: sessionId,
            type: .engagementCheck,
            message: "Test",
            priority: .medium
        )

        // Manually add to active nudges via evaluate
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.8, studentEnergy: 0.8))
        engine.evaluateMetrics(makeMetrics(tutorEnergy: 0.3, studentEnergy: 0.3))

        let initialCount = engine.activeNudges.count
        if let firstNudge = engine.activeNudges.first {
            engine.dismissNudge(firstNudge)
            XCTAssertLessThan(engine.activeNudges.count, initialCount)
        }
    }

    // MARK: - Config Presets

    func testLowSensitivityConfig() {
        let config = CoachingConfig.low
        XCTAssertEqual(config.sensitivity, .low)
        XCTAssertGreaterThan(config.nudgeCooldownSeconds, CoachingConfig.default.nudgeCooldownSeconds)
        XCTAssertGreaterThan(config.silenceThresholdSeconds, CoachingConfig.default.silenceThresholdSeconds)
    }

    func testHighSensitivityConfig() {
        let config = CoachingConfig.high
        XCTAssertEqual(config.sensitivity, .high)
        XCTAssertLessThan(config.nudgeCooldownSeconds, CoachingConfig.default.nudgeCooldownSeconds)
        XCTAssertLessThan(config.silenceThresholdSeconds, CoachingConfig.default.silenceThresholdSeconds)
    }

    // MARK: - Helpers

    private func makeMetrics(
        tutorEyeContact: Double = 0.7,
        studentEyeContact: Double = 0.5,
        tutorTalkPct: Double = 0.6,
        studentTalkPct: Double = 0.4,
        tutorEnergy: Double = 0.6,
        studentEnergy: Double = 0.5,
        tutorSpeaking: Bool = true,
        studentSpeaking: Bool = false,
        interruptions: Int = 0,
        trend: EngagementTrend = .stable,
        timestamp: Date = Date()
    ) -> EngagementMetrics {
        EngagementMetrics(
            tutor: ParticipantMetrics(
                eyeContactScore: tutorEyeContact,
                talkTimePercent: tutorTalkPct,
                energyScore: tutorEnergy,
                isSpeaking: tutorSpeaking
            ),
            student: ParticipantMetrics(
                eyeContactScore: studentEyeContact,
                talkTimePercent: studentTalkPct,
                energyScore: studentEnergy,
                isSpeaking: studentSpeaking
            ),
            session: SessionMetrics(
                interruptionCount: interruptions,
                silenceDurationCurrent: 0,
                engagementTrend: trend
            ),
            timestamp: timestamp
        )
    }
}
