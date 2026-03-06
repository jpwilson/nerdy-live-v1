import Foundation
import Combine
@testable import LiveSesh

// MARK: - Mock Metrics Engine

final class MockMetricsEngine: MetricsEngineProtocol {
    private let metricsSubject = CurrentValueSubject<EngagementMetrics, Never>(.empty)

    var metricsPublisher: AnyPublisher<EngagementMetrics, Never> {
        metricsSubject.eraseToAnyPublisher()
    }

    var latestMetrics: EngagementMetrics { metricsSubject.value }

    var startCallCount = 0
    var stopCallCount = 0
    var processGazeCallCount = 0
    var processSpeakingCallCount = 0
    var processExpressionCallCount = 0
    var processAudioLevelCallCount = 0
    var lastSessionId: UUID?

    func start(sessionId: UUID) {
        startCallCount += 1
        lastSessionId = sessionId
    }

    func stop() {
        stopCallCount += 1
    }

    func processGaze(_ gaze: GazeEstimation, for role: SpeakerRole) {
        processGazeCallCount += 1
    }

    func processSpeaking(_ state: SpeakingState) {
        processSpeakingCallCount += 1
    }

    func processExpression(_ expression: FacialExpression, for role: SpeakerRole) {
        processExpressionCallCount += 1
    }

    func processAudioLevel(_ level: AudioLevel) {
        processAudioLevelCallCount += 1
    }

    func emit(_ metrics: EngagementMetrics) {
        metricsSubject.send(metrics)
    }
}

// MARK: - Mock Coaching Engine

final class MockCoachingEngine: CoachingEngineProtocol {
    private let nudgeSubject = PassthroughSubject<CoachingNudge, Never>()

    var nudgePublisher: AnyPublisher<CoachingNudge, Never> {
        nudgeSubject.eraseToAnyPublisher()
    }

    private(set) var activeNudges: [CoachingNudge] = []
    var config: CoachingConfig = .default

    var startCallCount = 0
    var stopCallCount = 0
    var evaluateCallCount = 0
    var dismissCallCount = 0
    var lastEvaluatedMetrics: EngagementMetrics?

    func start(sessionId: UUID) {
        startCallCount += 1
    }

    func stop() {
        stopCallCount += 1
    }

    func evaluateMetrics(_ metrics: EngagementMetrics) {
        evaluateCallCount += 1
        lastEvaluatedMetrics = metrics
    }

    func dismissNudge(_ nudge: CoachingNudge) {
        dismissCallCount += 1
        activeNudges.removeAll { $0.id == nudge.id }
    }

    func emitNudge(_ nudge: CoachingNudge) {
        activeNudges.append(nudge)
        nudgeSubject.send(nudge)
    }
}

// MARK: - Mock Supabase Service

final class MockSupabaseService: SupabaseServiceProtocol {
    var savedSessions: [LiveSession] = []
    var savedSummaries: [SessionSummary] = []
    var savedSnapshots: [MetricsSnapshot] = []
    var savedNudges: [CoachingNudge] = []
    var shouldThrowError = false
    var fetchSessionsResult: [LiveSession] = []
    var fetchSummariesResult: [SessionSummary] = []

    func saveSession(_ session: LiveSession) async throws {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        savedSessions.append(session)
    }

    func saveSummary(_ summary: SessionSummary) async throws {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        savedSummaries.append(summary)
    }

    func saveMetricsSnapshot(_ snapshot: MetricsSnapshot) async throws {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        savedSnapshots.append(snapshot)
    }

    func saveNudge(_ nudge: CoachingNudge) async throws {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        savedNudges.append(nudge)
    }

    func fetchSessions(tutorId: UUID) async throws -> [LiveSession] {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        return fetchSessionsResult
    }

    func fetchSummary(sessionId: UUID) async throws -> SessionSummary? {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        return fetchSummariesResult.first { $0.sessionId == sessionId }
    }

    func fetchSummaries(tutorId: UUID) async throws -> [SessionSummary] {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        return fetchSummariesResult
    }

    func fetchTutorTrends(tutorId: UUID, days: Int) async throws -> TutorTrends {
        if shouldThrowError { throw SupabaseError.httpError(statusCode: 500) }
        return TutorTrends(
            tutorId: tutorId, days: days, averageEngagement: 75,
            sessionCount: 10, engagementByDate: [], topRecommendations: []
        )
    }
}

// MARK: - Test Data Helpers

enum TestData {
    static let sessionId = UUID()
    static let tutorId = UUID()

    static func makeSession(
        id: UUID = UUID(),
        subject: String = "Algebra",
        level: StudentLevel = .highSchool,
        endedAt: Date? = nil,
        engagement: Double? = nil
    ) -> LiveSession {
        LiveSession(
            id: id,
            tutorId: tutorId,
            studentId: UUID(),
            subject: subject,
            studentLevel: level,
            startedAt: Date().addingTimeInterval(-3600),
            endedAt: endedAt,
            engagementScore: engagement
        )
    }

    static func makeMetrics(
        tutorEyeContact: Double = 0.8,
        studentEyeContact: Double = 0.6,
        tutorTalkPct: Double = 0.6,
        studentTalkPct: Double = 0.4,
        tutorEnergy: Double = 0.7,
        studentEnergy: Double = 0.5,
        tutorSpeaking: Bool = true,
        studentSpeaking: Bool = false,
        interruptions: Int = 0,
        silence: TimeInterval = 0,
        trend: EngagementTrend = .stable
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
                silenceDurationCurrent: silence,
                engagementTrend: trend
            ),
            timestamp: Date()
        )
    }

    static func makeNudge(
        type: NudgeType = .engagementCheck,
        message: String = "Test nudge",
        priority: NudgePriority = .medium,
        sessionId: UUID = sessionId
    ) -> CoachingNudge {
        CoachingNudge(
            sessionId: sessionId,
            type: type,
            message: message,
            priority: priority
        )
    }

    static func makeSummary(
        sessionId: UUID = sessionId,
        duration: Int = 45,
        engagement: Double = 72,
        tutorTalk: Double = 0.62,
        studentTalk: Double = 0.38,
        tutorEye: Double = 0.78,
        studentEye: Double = 0.54,
        interruptions: Int = 8,
        recommendations: [String] = ["Try shorter explanations"]
    ) -> SessionSummary {
        SessionSummary(
            id: UUID(),
            sessionId: sessionId,
            durationMinutes: duration,
            talkTimeRatio: TalkTimeRatio(tutor: tutorTalk, student: studentTalk),
            avgEyeContact: EyeContactSummary(tutor: tutorEye, student: studentEye),
            totalInterruptions: interruptions,
            engagementScore: engagement,
            keyMoments: [
                KeyMoment(timestamp: "00:12:34", type: "attention_drop", description: "Student engagement dropped")
            ],
            recommendations: recommendations,
            createdAt: Date()
        )
    }
}
