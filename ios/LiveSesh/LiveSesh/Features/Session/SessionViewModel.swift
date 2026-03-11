import Foundation
import Combine
#if os(iOS)
import UIKit
#endif

@MainActor
final class SessionViewModel: ObservableObject {
    @Published var isSessionActive = false
    @Published var subject = ""
    @Published var studentLevel: StudentLevel = .highSchool
    @Published var coachingSensitivity: CoachingSensitivity = .medium
    @Published var currentMetrics: EngagementMetrics = .empty
    @Published var activeNudges: [CoachingNudge] = []
    @Published var sessionDuration = "00:00"

    @Published var currentPhase = "" // Shows current simulation phase
    @Published var syncStatus = ""

    private var session: LiveSession?
    private var cancellables = Set<AnyCancellable>()
    private var sessionTimer: Timer?
    private var sessionStartTime: Date?
    private var simulatorProvider: SimulatorDataProvider?
    private var lastSnapshotSavedAt: Date?
    private var syncTask: Task<Void, Never>?
    private var batteryLevelAtStart: Double = 0
    private var wasChargingAtStart: Bool = false

    private let metricsEngine: MetricsEngineProtocol
    private let coachingEngine: CoachingEngineProtocol
    private let sessionStore: SessionStore
    private let supabaseService: SupabaseServiceProtocol
    private let tutorId: UUID
    let liveCaptureController: LiveCaptureController

    init(metricsEngine: MetricsEngineProtocol? = nil,
         coachingEngine: CoachingEngineProtocol? = nil,
         sessionStore: SessionStore? = nil,
         supabaseService: SupabaseServiceProtocol? = nil,
         authenticatedTutorId: UUID? = nil) {
        let resolvedMetricsEngine = metricsEngine ?? MetricsEngine()
        let resolvedCoachingEngine = coachingEngine ?? CoachingEngine()
        let resolvedSessionStore = sessionStore ?? SessionStore()
        let resolvedSupabaseService = supabaseService ?? SupabaseService()

        self.metricsEngine = resolvedMetricsEngine
        self.coachingEngine = resolvedCoachingEngine
        self.sessionStore = resolvedSessionStore
        self.supabaseService = resolvedSupabaseService
        self.tutorId = authenticatedTutorId ?? Self.resolveLocalTutorId()
        self.liveCaptureController = LiveCaptureController(metricsEngine: resolvedMetricsEngine)
        self.syncStatus = Self.makeSyncStatus(for: resolvedSupabaseService)
        setupSubscriptions()
    }

    private func setupSubscriptions() {
        metricsEngine.metricsPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] metrics in
                self?.currentMetrics = metrics
                self?.coachingEngine.evaluateMetrics(metrics)
                self?.persistSnapshotIfNeeded(metrics)
            }
            .store(in: &cancellables)

        coachingEngine.nudgePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] nudge in
                self?.activeNudges.append(nudge)
                self?.persistNudge(nudge)
            }
            .store(in: &cancellables)
    }

    func startSession() {
        let newSession = LiveSession.new(
            tutorId: tutorId,
            subject: subject.isEmpty ? "General" : subject,
            level: studentLevel
        )

        session = newSession
        sessionStore.saveSession(newSession)
        enqueueSync("session start") { [newSession] in
            try await self.supabaseService.saveSession(newSession)
        }
        isSessionActive = true
        sessionStartTime = Date()
        sessionDuration = "00:00"
        activeNudges = []
        currentMetrics = .empty
        lastSnapshotSavedAt = nil
        currentPhase = ""

        // Configure coaching
        switch coachingSensitivity {
        case .low: coachingEngine.config = .low
        case .medium: coachingEngine.config = .default
        case .high: coachingEngine.config = .high
        }

        metricsEngine.start(sessionId: newSession.id)
        coachingEngine.start(sessionId: newSession.id)
        startTimer()
        startBatteryMonitoring()

        Task { [weak self] in
            await self?.startLiveCapture()
        }
    }

    func endSession() {
        simulatorProvider?.stop()
        simulatorProvider = nil
        liveCaptureController.stop()
        metricsEngine.stop()
        coachingEngine.stop()
        stopTimer()

        if var session = session {
            session.endedAt = Date()
            session.engagementScore = computeOverallScore()
            sessionStore.saveSession(session)
            enqueueSync("session update") { [session] in
                try await self.supabaseService.saveSession(session)
            }

            // Generate summary
            let summary = generateSummary(for: session)
            sessionStore.saveSummary(summary)
            enqueueSync("session summary") { [summary] in
                try await self.supabaseService.saveSummary(summary)
            }
        }

        isSessionActive = false
        session = nil
        activeNudges = []
        currentMetrics = .empty
        lastSnapshotSavedAt = nil
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
            createdAt: Date(),
            batteryUsage: captureBatteryUsage()
        )
    }

    private func startSimulatorDataIfNeeded() {
        #if targetEnvironment(simulator)
        let provider = SimulatorDataProvider(
            metricsEngine: metricsEngine,
            scenario: .realistic
        )
        simulatorProvider = provider
        provider.start()
        currentPhase = "Simulator Demo Mode"
        #endif
    }

    private func startLiveCapture() async {
        let didStart = await liveCaptureController.start()
        if didStart {
            currentPhase = "Live Device Capture"
            return
        }

        #if targetEnvironment(simulator)
        // Fall back to simulated signals when the simulator cannot access real capture hardware.
        coachingEngine.config.nudgeCooldownSeconds = 15
        coachingEngine.config.silenceThresholdSeconds = 20
        coachingEngine.config.eyeContactThreshold = 0.35
        coachingEngine.config.talkTimeImbalanceThreshold = 0.75
        coachingEngine.config.energyDropThreshold = 0.15
        startSimulatorDataIfNeeded()
        #else
        currentPhase = liveCaptureController.status.message ?? "Live capture unavailable"
        #endif
    }

    private func persistSnapshotIfNeeded(_ metrics: EngagementMetrics) {
        guard isSessionActive, let session else { return }

        if let lastSnapshotSavedAt,
           metrics.timestamp.timeIntervalSince(lastSnapshotSavedAt) < 1.0 {
            return
        }

        guard hasMeaningfulSignal(metrics) else { return }

        let snapshot = MetricsSnapshot(from: metrics, sessionId: session.id)
        sessionStore.saveSnapshot(snapshot)
        enqueueSync("metrics snapshot") { [snapshot] in
            try await self.supabaseService.saveMetricsSnapshot(snapshot)
        }
        lastSnapshotSavedAt = metrics.timestamp
    }

    private func persistNudge(_ nudge: CoachingNudge) {
        guard isSessionActive, session != nil else { return }
        sessionStore.saveNudge(nudge)
        enqueueSync("coaching nudge") { [nudge] in
            try await self.supabaseService.saveNudge(nudge)
        }
    }

    private func hasMeaningfulSignal(_ metrics: EngagementMetrics) -> Bool {
        metrics.tutor.eyeContactScore > 0 ||
        metrics.student.eyeContactScore > 0 ||
        metrics.tutor.isSpeaking ||
        metrics.student.isSpeaking ||
        metrics.session.interruptionCount > 0 ||
        metrics.session.silenceDurationCurrent > 0 ||
        metrics.tutor.energyScore != 0.5 ||
        metrics.student.energyScore != 0.5
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

    private func enqueueSync(_ label: String, operation: @escaping () async throws -> Void) {
        guard supabaseService.hasAuthenticatedAccess else { return }

        let previousTask = syncTask
        syncTask = Task { @MainActor [weak self, previousTask] in
            if let previousTask {
                await previousTask.value
            }

            do {
                try await operation()
                self?.syncStatus = Self.cloudSyncReadyMessage
            } catch {
                self?.syncStatus = "Cloud sync failed while uploading \(label). Local data is still saved on this device."
            }
        }
    }

    private static func resolveLocalTutorId(defaults: UserDefaults = .standard) -> UUID {
        let key = "livesesh_local_tutor_id"

        if let existing = defaults.string(forKey: key),
           let tutorId = UUID(uuidString: existing) {
            return tutorId
        }

        let tutorId = UUID()
        defaults.set(tutorId.uuidString, forKey: key)
        return tutorId
    }

    private static func makeSyncStatus(for supabaseService: SupabaseServiceProtocol) -> String {
        if supabaseService.hasAuthenticatedAccess {
            return cloudSyncReadyMessage
        }

        if supabaseService.isConfigured {
            return cloudSyncNeedsAuthMessage
        }

        return cloudSyncDisabledMessage
    }

    private func startBatteryMonitoring() {
        #if os(iOS)
        UIDevice.current.isBatteryMonitoringEnabled = true
        batteryLevelAtStart = Double(UIDevice.current.batteryLevel)
        wasChargingAtStart = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
        #endif
    }

    private func captureBatteryUsage() -> BatteryUsage? {
        #if os(iOS)
        let currentLevel = Double(UIDevice.current.batteryLevel)
        guard batteryLevelAtStart >= 0, currentLevel >= 0 else { return nil }
        return BatteryUsage(
            startLevel: batteryLevelAtStart,
            endLevel: currentLevel,
            wasCharging: wasChargingAtStart
        )
        #else
        return nil
        #endif
    }

    private static let cloudSyncReadyMessage = "Cloud sync is active. Session data uploads to Supabase in the background."
    private static let cloudSyncNeedsAuthMessage = "Supabase is configured, but uploads are blocked by RLS until the app sends an authenticated tutor token. Add SUPABASE_ACCESS_TOKEN for now or wire real app auth."
    private static let cloudSyncDisabledMessage = "Cloud sync is off. Add SUPABASE_URL and SUPABASE_ANON_KEY in the app build settings or scheme environment to enable Supabase configuration."
}
