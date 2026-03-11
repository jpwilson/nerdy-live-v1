import Foundation
import Combine

protocol MetricsEngineProtocol: AnyObject {
    var metricsPublisher: AnyPublisher<EngagementMetrics, Never> { get }
    var latestMetrics: EngagementMetrics { get }

    func start(sessionId: UUID)
    func stop()
    func processGaze(_ gaze: GazeEstimation, for role: SpeakerRole)
    func processSpeaking(_ state: SpeakingState)
    func processExpression(_ expression: FacialExpression, for role: SpeakerRole)
    func processAudioLevel(_ level: AudioLevel)
}

final class MetricsEngine: MetricsEngineProtocol {
    private let metricsSubject = CurrentValueSubject<EngagementMetrics, Never>(.empty)

    var metricsPublisher: AnyPublisher<EngagementMetrics, Never> {
        metricsSubject.eraseToAnyPublisher()
    }

    var latestMetrics: EngagementMetrics {
        metricsSubject.value
    }

    private var sessionId: UUID?
    private var isRunning = false
    private var updateTimer: Timer?

    // Sliding window data
    private let windowSize: TimeInterval
    private var gazeHistory: [SpeakerRole: RollingWindow<GazeEstimation>]
    private var speakingHistory: RollingWindow<SpeakingState>
    private var expressionHistory: [SpeakerRole: RollingWindow<FacialExpression>]
    private var audioLevelHistory: RollingWindow<AudioLevel>

    // Cumulative counters
    private var interruptionDetector: InterruptionDetector
    private var silenceTracker: SilenceTracker
    private var trendAnalyzer: TrendAnalyzer
    private var attentionDriftTracker: AttentionDriftTracker

    init(windowSize: TimeInterval = 30) {
        self.windowSize = windowSize
        self.gazeHistory = [
            .tutor: RollingWindow(windowSize: windowSize),
            .student: RollingWindow(windowSize: windowSize)
        ]
        self.speakingHistory = RollingWindow(windowSize: windowSize)
        self.expressionHistory = [
            .tutor: RollingWindow(windowSize: windowSize),
            .student: RollingWindow(windowSize: windowSize)
        ]
        self.audioLevelHistory = RollingWindow(windowSize: windowSize)
        self.interruptionDetector = InterruptionDetector()
        self.silenceTracker = SilenceTracker()
        self.trendAnalyzer = TrendAnalyzer()
        self.attentionDriftTracker = AttentionDriftTracker()
    }

    func start(sessionId: UUID) {
        self.sessionId = sessionId
        isRunning = true
        startUpdateTimer()
    }

    func stop() {
        isRunning = false
        updateTimer?.invalidate()
        updateTimer = nil
        reset()
    }

    func processGaze(_ gaze: GazeEstimation, for role: SpeakerRole) {
        guard isRunning else { return }
        gazeHistory[role]?.add(gaze)
    }

    func processSpeaking(_ state: SpeakingState) {
        guard isRunning else { return }
        speakingHistory.add(state)
        interruptionDetector.process(state)
        silenceTracker.process(state)
    }

    func processExpression(_ expression: FacialExpression, for role: SpeakerRole) {
        guard isRunning else { return }
        expressionHistory[role]?.add(expression)
    }

    func processAudioLevel(_ level: AudioLevel) {
        guard isRunning else { return }
        audioLevelHistory.add(level)
    }

    // MARK: - Private

    private func startUpdateTimer() {
        updateTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.computeMetrics()
        }
    }

    private func computeMetrics() {
        let now = Date()

        let tutorEyeContact = computeEyeContactScore(for: .tutor)
        let studentEyeContact = computeEyeContactScore(for: .student)
        let (tutorTalkPct, studentTalkPct) = computeTalkTimeBalance()
        let tutorEnergy = computeEnergyScore(for: .tutor)
        let studentEnergy = computeEnergyScore(for: .student)
        let tutorSpeaking = isSpeakingNow(role: .tutor)
        let studentSpeaking = isSpeakingNow(role: .student)

        let overallEngagement = (tutorEyeContact + studentEyeContact +
                                 tutorEnergy + studentEnergy) / 4.0
        trendAnalyzer.addDataPoint(overallEngagement)

        // Compute attention drift for each participant
        let tutorDrift = attentionDriftTracker.computeDrift(
            eyeContact: tutorEyeContact,
            energy: tutorEnergy,
            isSpeaking: tutorSpeaking,
            silenceDuration: silenceTracker.currentSilenceDuration,
            gazeHistory: gazeHistory[.tutor]?.items ?? [],
            expressionHistory: expressionHistory[.tutor]?.items ?? [],
            for: .tutor
        )
        let studentDrift = attentionDriftTracker.computeDrift(
            eyeContact: studentEyeContact,
            energy: studentEnergy,
            isSpeaking: studentSpeaking,
            silenceDuration: silenceTracker.currentSilenceDuration,
            gazeHistory: gazeHistory[.student]?.items ?? [],
            expressionHistory: expressionHistory[.student]?.items ?? [],
            for: .student
        )

        let metrics = EngagementMetrics(
            tutor: ParticipantMetrics(
                eyeContactScore: tutorEyeContact,
                talkTimePercent: tutorTalkPct,
                energyScore: tutorEnergy,
                isSpeaking: tutorSpeaking,
                attentionDrift: tutorDrift
            ),
            student: ParticipantMetrics(
                eyeContactScore: studentEyeContact,
                talkTimePercent: studentTalkPct,
                energyScore: studentEnergy,
                isSpeaking: studentSpeaking,
                attentionDrift: studentDrift
            ),
            session: SessionMetrics(
                interruptionCount: interruptionDetector.count,
                silenceDurationCurrent: silenceTracker.currentSilenceDuration,
                engagementTrend: trendAnalyzer.currentTrend
            ),
            timestamp: now
        )

        metricsSubject.send(metrics)
    }

    private func computeEyeContactScore(for role: SpeakerRole) -> Double {
        let gazes = gazeHistory[role]?.items ?? []
        guard !gazes.isEmpty else { return 0 }

        let lookingCount = gazes.filter { $0.isLookingAtCamera }.count
        return Double(lookingCount) / Double(gazes.count)
    }

    private func computeTalkTimeBalance() -> (tutor: Double, student: Double) {
        let states = speakingHistory.items
        guard !states.isEmpty else { return (0.5, 0.5) }

        let tutorFrames = states.filter { $0.isSpeaking && $0.speakerId == .tutor }.count
        let studentFrames = states.filter { $0.isSpeaking && $0.speakerId == .student }.count
        let total = max(tutorFrames + studentFrames, 1)

        return (Double(tutorFrames) / Double(total), Double(studentFrames) / Double(total))
    }

    private func computeEnergyScore(for role: SpeakerRole) -> Double {
        guard let expressions = expressionHistory[role]?.items, !expressions.isEmpty else { return 0.5 }

        let avgArousal = expressions.map(\.arousal).reduce(0, +) / Double(expressions.count)
        let avgValence = expressions.map(\.valence).reduce(0, +) / Double(expressions.count)

        // Energy is a combination of arousal and positive valence
        return min(1.0, max(0, (avgArousal + (avgValence + 1) / 2) / 2))
    }

    private func isSpeakingNow(role: SpeakerRole) -> Bool {
        guard let latest = speakingHistory.items.last else { return false }
        return latest.isSpeaking && latest.speakerId == role
    }

    private func reset() {
        gazeHistory = [
            .tutor: RollingWindow(windowSize: windowSize),
            .student: RollingWindow(windowSize: windowSize)
        ]
        speakingHistory = RollingWindow(windowSize: windowSize)
        expressionHistory = [
            .tutor: RollingWindow(windowSize: windowSize),
            .student: RollingWindow(windowSize: windowSize)
        ]
        audioLevelHistory = RollingWindow(windowSize: windowSize)
        interruptionDetector = InterruptionDetector()
        silenceTracker = SilenceTracker()
        trendAnalyzer = TrendAnalyzer()
        attentionDriftTracker = AttentionDriftTracker()
    }
}

// MARK: - Supporting Data Structures

struct RollingWindow<T> {
    let windowSize: TimeInterval
    private(set) var items: [T] = []
    private var timestamps: [Date] = []

    init(windowSize: TimeInterval) {
        self.windowSize = windowSize
    }

    mutating func add(_ item: T) {
        let now = Date()
        items.append(item)
        timestamps.append(now)
        prune(before: now.addingTimeInterval(-windowSize))
    }

    private mutating func prune(before cutoff: Date) {
        while let first = timestamps.first, first < cutoff {
            timestamps.removeFirst()
            items.removeFirst()
        }
    }

    var count: Int { items.count }
    var isEmpty: Bool { items.isEmpty }
}

// MARK: - Interruption Detection

final class InterruptionDetector {
    private(set) var count = 0
    private var previousState: SpeakingState?
    private var overlapStartTime: Date?
    private let minOverlapDuration: TimeInterval = 0.5

    func process(_ state: SpeakingState) {
        defer { previousState = state }

        guard let previous = previousState else { return }

        let wasOverlapping = previous.isSpeaking && previous.speakerId != .unknown
        let isOverlapping = state.isSpeaking && state.speakerId != previous.speakerId && state.speakerId != .unknown

        if isOverlapping && !wasOverlapping {
            overlapStartTime = state.timestamp
        } else if !isOverlapping && wasOverlapping {
            if let start = overlapStartTime,
               state.timestamp.timeIntervalSince(start) >= minOverlapDuration {
                count += 1
            }
            overlapStartTime = nil
        }
    }

    func reset() {
        count = 0
        previousState = nil
        overlapStartTime = nil
    }
}

// MARK: - Silence Tracking

final class SilenceTracker {
    private(set) var currentSilenceDuration: TimeInterval = 0
    private var silenceStartTime: Date?
    private var lastSpeakingTime: Date?

    func process(_ state: SpeakingState) {
        if state.isSpeaking {
            lastSpeakingTime = state.timestamp
            silenceStartTime = nil
            currentSilenceDuration = 0
        } else {
            if silenceStartTime == nil {
                silenceStartTime = state.timestamp
            }
            if let start = silenceStartTime {
                currentSilenceDuration = state.timestamp.timeIntervalSince(start)
            }
        }
    }

    func reset() {
        currentSilenceDuration = 0
        silenceStartTime = nil
        lastSpeakingTime = nil
    }
}

// MARK: - Trend Analysis

final class TrendAnalyzer {
    private var dataPoints: [Double] = []
    private let windowSize = 10
    private(set) var currentTrend: EngagementTrend = .stable

    func addDataPoint(_ value: Double) {
        dataPoints.append(value)
        if dataPoints.count > windowSize * 2 {
            dataPoints.removeFirst(dataPoints.count - windowSize * 2)
        }
        computeTrend()
    }

    private func computeTrend() {
        guard dataPoints.count >= windowSize else {
            currentTrend = .stable
            return
        }

        let recentWindow = Array(dataPoints.suffix(windowSize))
        let previousWindow = Array(dataPoints.dropLast(windowSize).suffix(windowSize))

        guard !previousWindow.isEmpty else {
            currentTrend = .stable
            return
        }

        let recentAvg = recentWindow.reduce(0, +) / Double(recentWindow.count)
        let previousAvg = previousWindow.reduce(0, +) / Double(previousWindow.count)
        let diff = recentAvg - previousAvg

        if diff > 0.05 {
            currentTrend = .rising
        } else if diff < -0.05 {
            currentTrend = .declining
        } else {
            currentTrend = .stable
        }
    }

    func reset() {
        dataPoints = []
        currentTrend = .stable
    }
}

// MARK: - Attention Drift Tracking

final class AttentionDriftTracker {
    /// Rolling history of eye-contact scores per role, used to detect sudden drops.
    private var eyeContactHistory: [SpeakerRole: [Double]] = [.tutor: [], .student: []]
    /// Rolling history of gaze stability (variance in gaze direction).
    private var gazeStabilityHistory: [SpeakerRole: [Double]] = [.tutor: [], .student: []]
    private let historyLimit = 20

    /// Compute attention drift score for a participant.
    /// Returns a value from 0.0 (fully attentive) to 1.0 (completely drifted).
    func computeDrift(
        eyeContact: Double,
        energy: Double,
        isSpeaking: Bool,
        silenceDuration: TimeInterval,
        gazeHistory: [GazeEstimation],
        expressionHistory: [FacialExpression],
        for role: SpeakerRole
    ) -> Double {
        // Factor 1: Low eye contact (weight 0.30)
        let eyeContactFactor = 1.0 - eyeContact

        // Factor 2: Gaze instability — rapid direction changes = fidgeting (weight 0.25)
        let gazeInstability = computeGazeInstability(gazeHistory)

        // Factor 3: Silence + low eye contact combined signal (weight 0.20)
        // Normalized silence: 0 at 0s, 1.0 at 180s+
        let normalizedSilence = min(1.0, silenceDuration / 180.0)
        let silenceFactor = isSpeaking ? 0.0 : normalizedSilence

        // Factor 4: Expression valence drop (weight 0.15)
        let valenceDrop = computeValenceDrop(expressionHistory)

        // Factor 5: Eye contact trend — sudden drops (weight 0.10)
        let eyeContactDrop = computeEyeContactDrop(eyeContact, for: role)

        let drift = eyeContactFactor * 0.30
            + gazeInstability * 0.25
            + silenceFactor * 0.20
            + valenceDrop * 0.15
            + eyeContactDrop * 0.10

        return min(1.0, max(0.0, drift))
    }

    private func computeGazeInstability(_ gazes: [GazeEstimation]) -> Double {
        guard gazes.count >= 3 else { return 0 }
        let recent = gazes.suffix(10)
        var directionChanges = 0
        var previousLooking: Bool?
        for gaze in recent {
            if let prev = previousLooking, prev != gaze.isLookingAtCamera {
                directionChanges += 1
            }
            previousLooking = gaze.isLookingAtCamera
        }
        // Normalize: 0-1 changes = stable, 5+ changes = very unstable
        return min(1.0, Double(directionChanges) / 5.0)
    }

    private func computeValenceDrop(_ expressions: [FacialExpression]) -> Double {
        guard expressions.count >= 4 else { return 0 }
        let recentHalf = expressions.suffix(expressions.count / 2)
        let olderHalf = expressions.prefix(expressions.count / 2)

        guard !olderHalf.isEmpty, !recentHalf.isEmpty else { return 0 }

        let recentValence = recentHalf.map(\.valence).reduce(0, +) / Double(recentHalf.count)
        let olderValence = olderHalf.map(\.valence).reduce(0, +) / Double(olderHalf.count)

        // A drop in valence from positive to less positive / negative indicates drift
        let drop = olderValence - recentValence
        return min(1.0, max(0.0, drop))
    }

    private func computeEyeContactDrop(_ current: Double, for role: SpeakerRole) -> Double {
        var history = eyeContactHistory[role] ?? []
        history.append(current)
        if history.count > historyLimit {
            history.removeFirst(history.count - historyLimit)
        }
        eyeContactHistory[role] = history

        guard history.count >= 4 else { return 0 }

        let olderAvg = history.prefix(history.count / 2).reduce(0, +) / Double(history.count / 2)
        let recentAvg = history.suffix(history.count / 2).reduce(0, +) / Double(history.count / 2)

        let drop = olderAvg - recentAvg
        return min(1.0, max(0.0, drop * 2.0)) // Amplify: a 0.5 drop = 1.0 signal
    }

    func reset() {
        eyeContactHistory = [.tutor: [], .student: []]
        gazeStabilityHistory = [.tutor: [], .student: []]
    }
}
