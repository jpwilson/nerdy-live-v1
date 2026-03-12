import Foundation
import Combine

protocol CoachingEngineProtocol: AnyObject {
    var nudgePublisher: AnyPublisher<CoachingNudge, Never> { get }
    var activeNudges: [CoachingNudge] { get }
    var config: CoachingConfig { get set }

    func start(sessionId: UUID)
    func stop()
    func evaluateMetrics(_ metrics: EngagementMetrics)
    func dismissNudge(_ nudge: CoachingNudge)
}

final class CoachingEngine: CoachingEngineProtocol {
    private let nudgeSubject = PassthroughSubject<CoachingNudge, Never>()

    var nudgePublisher: AnyPublisher<CoachingNudge, Never> {
        nudgeSubject.eraseToAnyPublisher()
    }

    private(set) var activeNudges: [CoachingNudge] = []
    var config: CoachingConfig

    private var sessionId: UUID?
    private var isRunning = false
    private var lastNudgeTime: [NudgeType: Date] = [:]
    private var nudgeHistory: [CoachingNudge] = []

    // Tracking for sustained conditions
    private var studentSilenceStart: Date?
    private var lowEyeContactStart: Date?
    private var highTutorTalkStart: Date?
    private var recentInterruptionCount = 0
    private var previousEnergyScore: Double?

    init(config: CoachingConfig = .default) {
        self.config = config
    }

    func start(sessionId: UUID) {
        self.sessionId = sessionId
        isRunning = true
        resetTracking()
    }

    func stop() {
        isRunning = false
        sessionId = nil
    }

    func evaluateMetrics(_ metrics: EngagementMetrics) {
        guard isRunning, let sessionId else { return }

        checkStudentSilence(metrics, sessionId: sessionId)
        checkEyeContact(metrics, sessionId: sessionId)
        checkTalkTimeBalance(metrics, sessionId: sessionId)
        checkEnergyDrop(metrics, sessionId: sessionId)
        checkInterruptions(metrics, sessionId: sessionId)
        checkPositiveReinforcement(metrics, sessionId: sessionId)

        // Auto-dismiss expired nudges
        let now = Date()
        activeNudges.removeAll { nudge in
            now.timeIntervalSince(nudge.timestamp) > 5.0
        }
    }

    func dismissNudge(_ nudge: CoachingNudge) {
        if let index = activeNudges.firstIndex(where: { $0.id == nudge.id }) {
            activeNudges[index].wasDismissed = true
            activeNudges.remove(at: index)
        }
    }

    // MARK: - Nudge Checks

    private func checkStudentSilence(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.engagementCheck) else { return }

        if !metrics.student.isSpeaking {
            if studentSilenceStart == nil {
                studentSilenceStart = metrics.timestamp
            }
        } else {
            studentSilenceStart = nil
        }

        if let start = studentSilenceStart,
           metrics.timestamp.timeIntervalSince(start) >= config.silenceThresholdSeconds {
            emitNudge(
                type: .engagementCheck,
                message: "No student voice for \(Int(metrics.timestamp.timeIntervalSince(start)))s. Try asking an open-ended question to re-engage.",
                priority: .medium,
                sessionId: sessionId,
                triggerData: [
                    "student_silence_duration": metrics.timestamp.timeIntervalSince(start),
                    "student_eye_contact_avg": metrics.student.eyeContactScore
                ]
            )
            studentSilenceStart = nil // Reset after nudge
        }
    }

    private func checkEyeContact(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.attentionAlert) else { return }

        if metrics.student.eyeContactScore < config.eyeContactThreshold {
            if lowEyeContactStart == nil {
                lowEyeContactStart = metrics.timestamp
            }
        } else {
            lowEyeContactStart = nil
        }

        if let start = lowEyeContactStart,
           metrics.timestamp.timeIntervalSince(start) >= 30 {
            emitNudge(
                type: .attentionAlert,
                message: "Student eye contact dropped to \(Int(metrics.student.eyeContactScore * 100))% (last 30s). Try calling them by name or switching activities.",
                priority: .medium,
                sessionId: sessionId,
                triggerData: [
                    "student_eye_contact": metrics.student.eyeContactScore,
                    "duration_seconds": metrics.timestamp.timeIntervalSince(start)
                ]
            )
            lowEyeContactStart = nil
        }
    }

    private func checkTalkTimeBalance(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.talkTimeBalance) else { return }

        if metrics.tutor.talkTimePercent > config.talkTimeImbalanceThreshold {
            if highTutorTalkStart == nil {
                highTutorTalkStart = metrics.timestamp
            }
        } else {
            highTutorTalkStart = nil
        }

        if let start = highTutorTalkStart,
           metrics.timestamp.timeIntervalSince(start) >= 300 { // 5 min lecture
            emitNudge(
                type: .talkTimeBalance,
                message: "You've been talking \(Int(metrics.tutor.talkTimePercent * 100))% of the time. Try pausing for a question to check understanding.",
                priority: .low,
                sessionId: sessionId,
                triggerData: [
                    "tutor_talk_pct": metrics.tutor.talkTimePercent,
                    "duration_seconds": metrics.timestamp.timeIntervalSince(start)
                ]
            )
            highTutorTalkStart = nil
        }
    }

    private func checkEnergyDrop(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.energyDrop) else { return }

        if let previous = previousEnergyScore {
            let combinedEnergy = (metrics.tutor.energyScore + metrics.student.energyScore) / 2
            let drop = previous - combinedEnergy

            if drop >= config.energyDropThreshold {
                emitNudge(
                    type: .energyDrop,
                    message: "Session energy dropped by \(Int(drop * 100))% — consider a quick stretch break or topic change.",
                    priority: .low,
                    sessionId: sessionId,
                    triggerData: [
                        "energy_drop": drop,
                        "current_energy": combinedEnergy
                    ]
                )
            }
        }
        previousEnergyScore = (metrics.tutor.energyScore + metrics.student.energyScore) / 2
    }

    private func checkInterruptions(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.interruptionSpike) else { return }

        if metrics.session.interruptionCount > recentInterruptionCount {
            let newInterruptions = metrics.session.interruptionCount - recentInterruptionCount

            if newInterruptions >= config.interruptionSpikeCount {
                emitNudge(
                    type: .interruptionSpike,
                    message: "\(newInterruptions) interruptions in the last window. Try adding 3-second wait time after questions.",
                    priority: .medium,
                    sessionId: sessionId,
                    triggerData: [
                        "interruption_count": Double(metrics.session.interruptionCount),
                        "new_interruptions": Double(newInterruptions)
                    ]
                )
            }
        }
        recentInterruptionCount = metrics.session.interruptionCount
    }

    private func checkPositiveReinforcement(_ metrics: EngagementMetrics, sessionId: UUID) {
        guard config.enabledNudgeTypes.contains(.positiveReinforcement) else { return }

        let overallEngagement = (metrics.tutor.eyeContactScore + metrics.student.eyeContactScore +
                                 metrics.tutor.energyScore + metrics.student.energyScore) / 4

        if overallEngagement > 0.8 && metrics.session.engagementTrend == .rising {
            emitNudge(
                type: .positiveReinforcement,
                message: "Engagement is strong at \(Int(overallEngagement * 100))% and rising — great pace, keep it up!",
                priority: .low,
                sessionId: sessionId,
                triggerData: [
                    "overall_engagement": overallEngagement
                ]
            )
        }
    }

    // MARK: - Nudge Emission

    private func emitNudge(type: NudgeType, message: String, priority: NudgePriority,
                           sessionId: UUID, triggerData: [String: Double]) {
        let now = Date()

        // Check cooldown
        if let lastTime = lastNudgeTime[type],
           now.timeIntervalSince(lastTime) < config.nudgeCooldownSeconds {
            return
        }

        let nudge = CoachingNudge(
            sessionId: sessionId,
            type: type,
            message: message,
            priority: priority,
            triggerData: triggerData
        )

        lastNudgeTime[type] = now
        activeNudges.append(nudge)
        nudgeHistory.append(nudge)
        nudgeSubject.send(nudge)
    }

    private func resetTracking() {
        lastNudgeTime = [:]
        nudgeHistory = []
        activeNudges = []
        studentSilenceStart = nil
        lowEyeContactStart = nil
        highTutorTalkStart = nil
        recentInterruptionCount = 0
        previousEnergyScore = nil
    }
}
