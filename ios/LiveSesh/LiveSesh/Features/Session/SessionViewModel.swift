import Foundation
import Combine

@MainActor
final class SessionViewModel: ObservableObject {
    @Published var isSessionActive = false
    @Published var subject = ""
    @Published var studentLevel: StudentLevel = .highSchool
    @Published var coachingSensitivity: CoachingSensitivity = .medium
    @Published var currentMetrics: EngagementMetrics = .empty
    @Published var activeNudges: [CoachingNudge] = []
    @Published var sessionDuration = "00:00"

    private var session: LiveSession?
    private var cancellables = Set<AnyCancellable>()
    private var sessionTimer: Timer?
    private var sessionStartTime: Date?

    private let metricsEngine: MetricsEngineProtocol
    private let coachingEngine: CoachingEngineProtocol
    private let sessionStore: SessionStore

    init(metricsEngine: MetricsEngineProtocol? = nil,
         coachingEngine: CoachingEngineProtocol? = nil,
         sessionStore: SessionStore? = nil) {
        self.metricsEngine = metricsEngine ?? MetricsEngine()
        self.coachingEngine = coachingEngine ?? CoachingEngine()
        self.sessionStore = sessionStore ?? SessionStore()
        setupSubscriptions()
    }

    private func setupSubscriptions() {
        metricsEngine.metricsPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] metrics in
                self?.currentMetrics = metrics
                self?.coachingEngine.evaluateMetrics(metrics)
            }
            .store(in: &cancellables)

        coachingEngine.nudgePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] nudge in
                self?.activeNudges.append(nudge)
            }
            .store(in: &cancellables)
    }

    func startSession() {
        let newSession = LiveSession.new(
            tutorId: UUID(), // Would come from auth
            subject: subject.isEmpty ? "General" : subject,
            level: studentLevel
        )

        session = newSession
        isSessionActive = true
        sessionStartTime = Date()

        // Configure coaching
        switch coachingSensitivity {
        case .low: coachingEngine.config = .low
        case .medium: coachingEngine.config = .default
        case .high: coachingEngine.config = .high
        }

        metricsEngine.start(sessionId: newSession.id)
        coachingEngine.start(sessionId: newSession.id)
        startTimer()
    }

    func endSession() {
        metricsEngine.stop()
        coachingEngine.stop()
        stopTimer()

        if var session = session {
            session.endedAt = Date()
            session.engagementScore = computeOverallScore()
            sessionStore.saveSession(session)

            // Generate summary
            let summary = generateSummary(for: session)
            sessionStore.saveSummary(summary)
        }

        isSessionActive = false
        session = nil
        activeNudges = []
        currentMetrics = .empty
    }

    func dismissNudge(_ nudge: CoachingNudge) {
        coachingEngine.dismissNudge(nudge)
        activeNudges.removeAll { $0.id == nudge.id }
    }

    // MARK: - Private

    private func startTimer() {
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateDuration()
            }
        }
    }

    private func stopTimer() {
        sessionTimer?.invalidate()
        sessionTimer = nil
    }

    private func updateDuration() {
        guard let start = sessionStartTime else { return }
        let elapsed = Int(Date().timeIntervalSince(start))
        let minutes = elapsed / 60
        let seconds = elapsed % 60
        sessionDuration = String(format: "%02d:%02d", minutes, seconds)
    }

    private func computeOverallScore() -> Double {
        let m = currentMetrics
        let eyeContact = (m.tutor.eyeContactScore + m.student.eyeContactScore) / 2
        let energy = (m.tutor.energyScore + m.student.energyScore) / 2
        let talkBalance = 1.0 - abs(m.tutor.talkTimePercent - 0.5) * 2
        return (eyeContact * 30 + energy * 30 + talkBalance * 40) // Weighted out of 100
    }

    private func generateSummary(for session: LiveSession) -> SessionSummary {
        let m = currentMetrics
        return SessionSummary(
            id: UUID(),
            sessionId: session.id,
            durationMinutes: session.durationMinutes ?? 0,
            talkTimeRatio: TalkTimeRatio(tutor: m.tutor.talkTimePercent, student: m.student.talkTimePercent),
            avgEyeContact: EyeContactSummary(tutor: m.tutor.eyeContactScore, student: m.student.eyeContactScore),
            totalInterruptions: m.session.interruptionCount,
            engagementScore: computeOverallScore(),
            keyMoments: [],
            recommendations: generateRecommendations(from: m),
            createdAt: Date()
        )
    }

    private func generateRecommendations(from metrics: EngagementMetrics) -> [String] {
        var recs: [String] = []

        if metrics.tutor.talkTimePercent > 0.7 {
            recs.append("Try shorter explanation segments and ask more questions")
        }
        if metrics.student.eyeContactScore < 0.4 {
            recs.append("Work on keeping student engaged - try more interactive activities")
        }
        if metrics.session.interruptionCount > 5 {
            recs.append("Practice giving more wait time after asking questions")
        }
        if (metrics.tutor.energyScore + metrics.student.energyScore) / 2 < 0.4 {
            recs.append("Consider adding breaks or varying the session pace")
        }
        if recs.isEmpty {
            recs.append("Great session! Keep up the good work.")
        }

        return recs
    }
}
