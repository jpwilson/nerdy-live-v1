import XCTest
@testable import LiveSesh

final class ModelsTests: XCTestCase {

    // MARK: - LiveSession

    func testNewSession() {
        let tutorId = UUID()
        let session = LiveSession.new(tutorId: tutorId, subject: "Math", level: .highSchool)

        XCTAssertEqual(session.tutorId, tutorId)
        XCTAssertEqual(session.subject, "Math")
        XCTAssertEqual(session.studentLevel, .highSchool)
        XCTAssertNil(session.endedAt)
        XCTAssertTrue(session.isActive)
        XCTAssertNil(session.durationMinutes)
    }

    func testSessionDuration() {
        let start = Date()
        var session = LiveSession(
            id: UUID(), tutorId: UUID(), subject: "Science",
            studentLevel: .college, startedAt: start
        )
        session.endedAt = start.addingTimeInterval(2700) // 45 minutes

        XCTAssertEqual(session.durationMinutes, 45)
        XCTAssertFalse(session.isActive)
    }

    func testSessionEquality() {
        let id = UUID()
        let session1 = LiveSession(
            id: id, tutorId: UUID(), subject: "Art",
            studentLevel: .elementary, startedAt: Date()
        )
        let session2 = LiveSession(
            id: id, tutorId: session1.tutorId, subject: "Art",
            studentLevel: .elementary, startedAt: session1.startedAt
        )
        XCTAssertEqual(session1, session2)
    }

    // MARK: - StudentLevel

    func testStudentLevelAllCases() {
        XCTAssertEqual(StudentLevel.allCases.count, 6)
    }

    func testStudentLevelRawValues() {
        XCTAssertEqual(StudentLevel.elementary.rawValue, "Elementary")
        XCTAssertEqual(StudentLevel.graduate.rawValue, "Graduate")
    }

    // MARK: - EngagementMetrics

    func testEmptyMetrics() {
        let metrics = EngagementMetrics.empty
        XCTAssertEqual(metrics.tutor, .empty)
        XCTAssertEqual(metrics.student, .empty)
        XCTAssertEqual(metrics.session, .empty)
    }

    func testParticipantMetricsEmpty() {
        let empty = ParticipantMetrics.empty
        XCTAssertEqual(empty.eyeContactScore, 0)
        XCTAssertEqual(empty.talkTimePercent, 0)
        XCTAssertEqual(empty.energyScore, 0)
        XCTAssertFalse(empty.isSpeaking)
    }

    func testSessionMetricsEmpty() {
        let empty = SessionMetrics.empty
        XCTAssertEqual(empty.interruptionCount, 0)
        XCTAssertEqual(empty.silenceDurationCurrent, 0)
        XCTAssertEqual(empty.engagementTrend, .stable)
    }

    // MARK: - MetricsSnapshot

    func testMetricsSnapshotFromMetrics() {
        let sessionId = UUID()
        let metrics = TestData.makeMetrics(
            tutorEyeContact: 0.85,
            studentEyeContact: 0.65,
            tutorTalkPct: 0.55,
            studentTalkPct: 0.45,
            interruptions: 3
        )

        let snapshot = MetricsSnapshot(from: metrics, sessionId: sessionId)
        XCTAssertEqual(snapshot.sessionId, sessionId)
        XCTAssertEqual(snapshot.tutorEyeContact, 0.85)
        XCTAssertEqual(snapshot.studentEyeContact, 0.65)
        XCTAssertEqual(snapshot.tutorTalkPct, 0.55)
        XCTAssertEqual(snapshot.interruptionCount, 3)
    }

    // MARK: - CoachingNudge

    func testNudgeCreation() {
        let nudge = TestData.makeNudge(
            type: .attentionAlert,
            message: "Student distracted",
            priority: .high
        )
        XCTAssertEqual(nudge.nudgeType, .attentionAlert)
        XCTAssertEqual(nudge.message, "Student distracted")
        XCTAssertEqual(nudge.priority, .high)
        XCTAssertFalse(nudge.wasDismissed)
    }

    func testNudgePriorityOrdering() {
        XCTAssertTrue(NudgePriority.low < NudgePriority.medium)
        XCTAssertTrue(NudgePriority.medium < NudgePriority.high)
        XCTAssertFalse(NudgePriority.high < NudgePriority.low)
    }

    func testNudgeTypeAllCases() {
        XCTAssertEqual(NudgeType.allCases.count, 6)
    }

    // MARK: - SessionSummary

    func testSessionSummary() {
        let summary = TestData.makeSummary(
            duration: 60,
            engagement: 85,
            tutorTalk: 0.55,
            studentTalk: 0.45,
            interruptions: 4
        )
        XCTAssertEqual(summary.durationMinutes, 60)
        XCTAssertEqual(summary.engagementScore, 85)
        XCTAssertEqual(summary.talkTimeRatio.tutor, 0.55)
        XCTAssertEqual(summary.totalInterruptions, 4)
    }

    func testKeyMomentIdentifiable() {
        let moment = KeyMoment(timestamp: "00:10:00", type: "drop", description: "Engagement dropped")
        XCTAssertEqual(moment.id, "00:10:00-drop")
    }

    // MARK: - CoachingConfig

    func testDefaultConfig() {
        let config = CoachingConfig.default
        XCTAssertEqual(config.sensitivity, .medium)
        XCTAssertEqual(config.nudgeCooldownSeconds, 60)
        XCTAssertEqual(config.silenceThresholdSeconds, 180)
        XCTAssertEqual(config.eyeContactThreshold, 0.30)
        XCTAssertEqual(config.talkTimeImbalanceThreshold, 0.80)
        XCTAssertEqual(config.energyDropThreshold, 0.20)
        XCTAssertEqual(config.interruptionSpikeCount, 3)
    }

    func testLowConfig() {
        let config = CoachingConfig.low
        XCTAssertEqual(config.sensitivity, .low)
        XCTAssertGreaterThan(config.nudgeCooldownSeconds, CoachingConfig.default.nudgeCooldownSeconds)
    }

    func testHighConfig() {
        let config = CoachingConfig.high
        XCTAssertEqual(config.sensitivity, .high)
        XCTAssertLessThan(config.nudgeCooldownSeconds, CoachingConfig.default.nudgeCooldownSeconds)
    }

    func testConfigEquality() {
        XCTAssertEqual(CoachingConfig.default, CoachingConfig.default)
        XCTAssertNotEqual(CoachingConfig.low, CoachingConfig.high)
    }

    // MARK: - Engagement Trend

    func testEngagementTrendRawValues() {
        XCTAssertEqual(EngagementTrend.rising.rawValue, "rising")
        XCTAssertEqual(EngagementTrend.stable.rawValue, "stable")
        XCTAssertEqual(EngagementTrend.declining.rawValue, "declining")
    }

    // MARK: - Codable Compliance

    func testLiveSessionCodable() throws {
        let session = TestData.makeSession()
        let data = try JSONEncoder.supabase.encode(session)
        let decoded = try JSONDecoder.supabase.decode(LiveSession.self, from: data)
        XCTAssertEqual(session.id, decoded.id)
        XCTAssertEqual(session.subject, decoded.subject)
    }

    func testEngagementMetricsCodable() throws {
        let metrics = TestData.makeMetrics()
        let data = try JSONEncoder.supabase.encode(metrics)
        let decoded = try JSONDecoder.supabase.decode(EngagementMetrics.self, from: data)
        XCTAssertEqual(metrics.tutor.eyeContactScore, decoded.tutor.eyeContactScore)
    }

    func testCoachingNudgeCodable() throws {
        let nudge = TestData.makeNudge()
        let data = try JSONEncoder.supabase.encode(nudge)
        let decoded = try JSONDecoder.supabase.decode(CoachingNudge.self, from: data)
        XCTAssertEqual(nudge.nudgeType, decoded.nudgeType)
        XCTAssertEqual(nudge.message, decoded.message)
    }

    func testSessionSummaryCodable() throws {
        let summary = TestData.makeSummary()
        let data = try JSONEncoder.supabase.encode(summary)
        let decoded = try JSONDecoder.supabase.decode(SessionSummary.self, from: data)
        XCTAssertEqual(summary.engagementScore, decoded.engagementScore)
        XCTAssertEqual(summary.recommendations, decoded.recommendations)
    }

    func testCoachingConfigCodable() throws {
        let config = CoachingConfig.default
        let data = try JSONEncoder.supabase.encode(config)
        let decoded = try JSONDecoder.supabase.decode(CoachingConfig.self, from: data)
        XCTAssertEqual(config, decoded)
    }

    // MARK: - TutorProfile

    func testTutorProfile() {
        let profile = TutorProfile(
            id: UUID(), name: "Jane Smith", email: "jane@example.com",
            totalSessions: 50, averageEngagement: 82.5, coachingScore: 4.3
        )
        XCTAssertEqual(profile.name, "Jane Smith")
        XCTAssertEqual(profile.totalSessions, 50)
    }
}
