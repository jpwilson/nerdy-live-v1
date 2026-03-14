import Foundation
import Combine
#if canImport(WebRTC)
@preconcurrency import WebRTC
#endif
#if canImport(LiveKit)
import LiveKit
#endif
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
    @Published var keyMoments: [KeyMoment] = []
    @Published var webRTCConnectionState: WebRTCConnectionState = .idle
    @Published var studentDisplayName: String?
    @Published var latestFaceDetection: FaceDetectionResult?
    @Published var latestGaze: GazeEstimation?
    @Published var latestExpression: FacialExpression?

    // Forwarded from LiveKitService so SwiftUI observes changes
    @Published var isMicrophoneEnabled = true

    private var session: LiveSession?
    private var cancellables = Set<AnyCancellable>()
    private var sessionTimer: Timer?
    private var sessionStartTime: Date?
    private var simulatorProvider: SimulatorDataProvider?
    private var lastSnapshotSavedAt: Date?
    private var syncTask: Task<Void, Never>?
    private var batteryLevelAtStart: Double = 0
    private var wasChargingAtStart: Bool = false
    private var previousEngagementTrend: EngagementTrend = .stable
    private var lastKeyMomentTime: [String: Date] = [:]
    private let keyMomentCooldown: TimeInterval = 30 // Min seconds between same-type moments

    private let metricsEngine: MetricsEngineProtocol
    private let coachingEngine: CoachingEngineProtocol
    private let sessionStore: SessionStore
    private let supabaseService: SupabaseServiceProtocol
    private let tutorId: UUID
    let liveCaptureController: LiveCaptureController
    #if canImport(WebRTC)
    let webRTCService = WebRTCService()

    // Student video analysis via WebRTC remote track
    private var studentVideoProcessor: VideoProcessor?
    private var studentFrameExtractor: WebRTCFrameExtractor?
    private var studentVideoCancellables = Set<AnyCancellable>()
    #endif

    #if canImport(LiveKit)
    let liveKitService = LiveKitService()

    // Student video analysis via LiveKit remote track
    private var lkStudentVideoProcessor: VideoProcessor?
    private var lkStudentFrameExtractor: LiveKitFrameExtractor?
    private var lkStudentVideoCancellables = Set<AnyCancellable>()
    #endif

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
                self?.detectKeyMoments(metrics)
            }
            .store(in: &cancellables)

        coachingEngine.nudgePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] nudge in
                self?.activeNudges.append(nudge)
                self?.persistNudge(nudge)
            }
            .store(in: &cancellables)

        // Subscribe to video processor face data for overlays
        #if os(iOS)
        liveCaptureController.videoProcessor.faceDetectionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] detection in
                self?.latestFaceDetection = detection
            }
            .store(in: &cancellables)

        liveCaptureController.videoProcessor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                self?.latestGaze = gaze
            }
            .store(in: &cancellables)

        liveCaptureController.videoProcessor.expressionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] expression in
                self?.latestExpression = expression
            }
            .store(in: &cancellables)
        #endif

        #if canImport(WebRTC)
        webRTCService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.webRTCConnectionState = state
                self?.studentDisplayName = self?.webRTCService.studentDisplayName
                // Capture student identity into the session when they connect
                if state == .studentConnected,
                   let name = self?.webRTCService.studentDisplayName,
                   self?.session?.studentName == nil {
                    self?.session?.studentName = name
                    if let session = self?.session {
                        self?.sessionStore.saveSession(session)
                    }
                }
            }
            .store(in: &cancellables)

        // Observe the remote video track and attach the student frame extractor
        webRTCService.$remoteVideoTrack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] track in
                self?.handleRemoteVideoTrackChange(track)
            }
            .store(in: &cancellables)
        #endif

        #if canImport(LiveKit)
        liveKitService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.webRTCConnectionState = state
                self?.studentDisplayName = self?.liveKitService.studentDisplayName
                if state == .studentConnected,
                   let name = self?.liveKitService.studentDisplayName,
                   self?.session?.studentName == nil {
                    self?.session?.studentName = name
                    if let session = self?.session {
                        self?.sessionStore.saveSession(session)
                    }
                }
            }
            .store(in: &cancellables)

        liveKitService.$remoteVideoTrack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] track in
                self?.handleLiveKitRemoteVideoTrackChange(track)
            }
            .store(in: &cancellables)

        // Forward mic state so SwiftUI can observe it
        liveKitService.$isMicrophoneEnabled
            .receive(on: DispatchQueue.main)
            .assign(to: &$isMicrophoneEnabled)
        #endif
    }

    func startSession(testModeEnabled: Bool = false, roomCode: String = "", accessToken: String? = nil) {
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
        keyMoments = []
        currentMetrics = .empty
        lastSnapshotSavedAt = nil
        currentPhase = ""
        previousEngagementTrend = .stable
        lastKeyMomentTime = [:]

        // Set test mode on the capture controller so it routes data to both roles
        liveCaptureController.testModeEnabled = testModeEnabled

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

        // Connect to video service when not in test mode and a room code is set
        if !testModeEnabled && !roomCode.isEmpty {
            #if canImport(LiveKit)
            Task { [weak self] in
                await self?.liveKitService.connect(
                    roomId: roomCode,
                    displayName: "Tutor",
                    accessToken: accessToken
                )
            }
            #elseif canImport(WebRTC)
            Task { [weak self] in
                await self?.webRTCService.connect(
                    roomId: roomCode,
                    displayName: "Tutor",
                    accessToken: accessToken
                )
            }
            #endif
        }
    }

    func endSession() {
        #if canImport(LiveKit)
        detachLiveKitStudentVideoAnalysis()
        liveKitService.disconnect()
        #endif
        #if canImport(WebRTC)
        detachStudentVideoAnalysis()
        webRTCService.disconnect()
        #endif
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

    // MARK: - Student Video Analysis (WebRTC Remote Track)

    #if canImport(WebRTC)
    private func handleRemoteVideoTrackChange(_ track: RTCVideoTrack?) {
        if let track {
            attachStudentVideoAnalysis(to: track)
        } else {
            detachStudentVideoAnalysis()
        }
    }

    private func attachStudentVideoAnalysis(to track: RTCVideoTrack) {
        // Tear down any existing student pipeline first
        detachStudentVideoAnalysis()

        let processor = VideoProcessor(analyzeEveryNFrames: 1) // Throttling is handled by the extractor
        processor.startProcessing()

        // Bind student video processor outputs to the metrics engine with .student role
        processor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                self?.metricsEngine.processGaze(gaze, for: .student)
            }
            .store(in: &studentVideoCancellables)

        processor.expressionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] expression in
                self?.metricsEngine.processExpression(expression, for: .student)
            }
            .store(in: &studentVideoCancellables)

        let extractor = WebRTCFrameExtractor(deliverEveryNFrames: 6)
        extractor.onFrame = { [weak processor] pixelBuffer in
            processor?.processPixelBuffer(pixelBuffer)
        }
        extractor.attach(to: track)

        studentVideoProcessor = processor
        studentFrameExtractor = extractor

        print("[SessionViewModel] Student video analysis pipeline attached")
    }

    private func detachStudentVideoAnalysis() {
        studentFrameExtractor?.detach()
        studentFrameExtractor = nil
        studentVideoProcessor?.stopProcessing()
        studentVideoProcessor = nil
        studentVideoCancellables.removeAll()
    }
    #endif

    // MARK: - Student Video Analysis (LiveKit Remote Track)

    #if canImport(LiveKit)
    private func handleLiveKitRemoteVideoTrackChange(_ track: VideoTrack?) {
        if let track {
            attachLiveKitStudentVideoAnalysis(to: track)
        } else {
            detachLiveKitStudentVideoAnalysis()
        }
    }

    private func attachLiveKitStudentVideoAnalysis(to track: VideoTrack) {
        detachLiveKitStudentVideoAnalysis()

        let processor = VideoProcessor(analyzeEveryNFrames: 1)
        processor.startProcessing()

        processor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                self?.metricsEngine.processGaze(gaze, for: .student)
            }
            .store(in: &lkStudentVideoCancellables)

        processor.expressionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] expression in
                self?.metricsEngine.processExpression(expression, for: .student)
            }
            .store(in: &lkStudentVideoCancellables)

        let extractor = LiveKitFrameExtractor(deliverEveryNFrames: 6)
        extractor.onFrame = { [weak processor] pixelBuffer in
            processor?.processPixelBuffer(pixelBuffer)
        }
        extractor.attach(to: track)

        lkStudentVideoProcessor = processor
        lkStudentFrameExtractor = extractor

        print("[SessionViewModel] LiveKit student video analysis pipeline attached")
    }

    private func detachLiveKitStudentVideoAnalysis() {
        lkStudentFrameExtractor?.detach()
        lkStudentFrameExtractor = nil
        lkStudentVideoProcessor?.stopProcessing()
        lkStudentVideoProcessor = nil
        lkStudentVideoCancellables.removeAll()
    }
    #endif

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
            keyMoments: keyMoments,
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

    // MARK: - Key Moments Detection

    private func detectKeyMoments(_ metrics: EngagementMetrics) {
        guard isSessionActive, let start = sessionStartTime else { return }
        let elapsed = Date().timeIntervalSince(start)
        let timestamp = formatTimestamp(elapsed)

        // 1. Attention drift exceeds threshold (0.6)
        let maxDrift = max(metrics.tutor.attentionDrift, metrics.student.attentionDrift)
        if maxDrift >= 0.6 {
            addKeyMoment(
                type: .attentionDrift,
                timestamp: timestamp,
                description: "Attention drift detected (score: \(String(format: "%.0f%%", maxDrift * 100))). Eye contact and engagement indicators suggest the participant may be losing focus."
            )
        }

        // 2. Silence exceeds 3 minutes (180 seconds)
        if metrics.session.silenceDurationCurrent >= 180 {
            addKeyMoment(
                type: .prolongedSilence,
                timestamp: timestamp,
                description: "Prolonged silence of \(Int(metrics.session.silenceDurationCurrent))s detected. Consider re-engaging with a question or activity change."
            )
        }

        // 3. Engagement trend changes from rising to declining
        if previousEngagementTrend == .rising && metrics.session.engagementTrend == .declining {
            addKeyMoment(
                type: .engagementDecline,
                timestamp: timestamp,
                description: "Engagement trend shifted from rising to declining. This inflection point may indicate the session content or pace needs adjustment."
            )
        }
        previousEngagementTrend = metrics.session.engagementTrend

        // 4. Interruption spike
        if metrics.session.interruptionCount > 0 && metrics.session.interruptionCount % 3 == 0 {
            addKeyMoment(
                type: .interruptionSpike,
                timestamp: timestamp,
                description: "Interruption count reached \(metrics.session.interruptionCount). Frequent interruptions may indicate excitement or confusion."
            )
        }
    }

    private func addKeyMoment(type: KeyMomentType, timestamp: String, description: String) {
        let now = Date()
        if let lastTime = lastKeyMomentTime[type.rawValue],
           now.timeIntervalSince(lastTime) < keyMomentCooldown {
            return // Cooldown not elapsed
        }

        let moment = KeyMoment(
            timestamp: timestamp,
            type: type.rawValue,
            description: description
        )
        keyMoments.append(moment)
        lastKeyMomentTime[type.rawValue] = now
    }

    private func formatTimestamp(_ elapsed: TimeInterval) -> String {
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        return String(format: "%02d:%02d", minutes, seconds)
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
