import Foundation
import Combine

/// Provides simulated video/audio analysis data for the iOS Simulator.
/// Generates realistic engagement patterns that evolve over time,
/// including attention drops, energy shifts, and speaking turn changes.
final class SimulatorDataProvider: ObservableObject {
    private var timer: Timer?
    private var elapsed: TimeInterval = 0
    private let tickInterval: TimeInterval = 0.5 // 2 Hz update rate

    private let metricsEngine: MetricsEngineProtocol
    private var scenario: SessionScenario

    init(metricsEngine: MetricsEngineProtocol, scenario: SessionScenario = .realistic) {
        self.metricsEngine = metricsEngine
        self.scenario = scenario
    }

    func start() {
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: tickInterval, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        elapsed += tickInterval
        let phase = scenario.phase(at: elapsed)

        // Generate gaze data
        let tutorGaze = generateGaze(
            lookingProbability: phase.tutorEyeContact,
            jitter: 0.1
        )
        metricsEngine.processGaze(tutorGaze, for: .tutor)

        let studentGaze = generateGaze(
            lookingProbability: phase.studentEyeContact,
            jitter: 0.15
        )
        metricsEngine.processGaze(studentGaze, for: .student)

        // Generate speaking data
        let speakingState = generateSpeaking(phase: phase)
        metricsEngine.processSpeaking(speakingState)

        // Generate expression data
        let tutorExpr = generateExpression(energy: phase.tutorEnergy, jitter: 0.1)
        metricsEngine.processExpression(tutorExpr, for: .tutor)

        let studentExpr = generateExpression(energy: phase.studentEnergy, jitter: 0.15)
        metricsEngine.processExpression(studentExpr, for: .student)
    }

    // MARK: - Data Generation

    private func generateGaze(lookingProbability: Double, jitter: Double) -> GazeEstimation {
        let adjusted = (lookingProbability + Double.random(in: -jitter...jitter)).clamped(to: 0...1)
        let isLooking = Double.random(in: 0...1) < adjusted

        let yaw = isLooking ? Double.random(in: -0.1...0.1) : Double.random(in: 0.2...0.6) * (Bool.random() ? 1 : -1)
        let pitch = isLooking ? Double.random(in: -0.08...0.08) : Double.random(in: 0.15...0.4) * (Bool.random() ? 1 : -1)

        return GazeEstimation(
            isLookingAtCamera: isLooking,
            gazeDirection: isLooking ? .atCamera : [.left, .right, .down, .away].randomElement()!,
            confidence: Double.random(in: 0.7...0.95),
            yaw: yaw,
            pitch: pitch,
            timestamp: Date()
        )
    }

    private func generateSpeaking(phase: SessionPhase) -> SpeakingState {
        let roll = Double.random(in: 0...1)

        let isTutorSpeaking = roll < phase.tutorTalkRatio
        let isStudentSpeaking = !isTutorSpeaking && roll < (phase.tutorTalkRatio + phase.studentTalkRatio)

        // Simulate interruptions
        let bothSpeaking = isTutorSpeaking && Double.random(in: 0...1) < phase.interruptionProbability

        if bothSpeaking || isTutorSpeaking {
            return SpeakingState(
                isSpeaking: true,
                speakerId: .tutor,
                volume: Double.random(in: 0.3...0.7),
                timestamp: Date()
            )
        } else if isStudentSpeaking {
            return SpeakingState(
                isSpeaking: true,
                speakerId: .student,
                volume: Double.random(in: 0.2...0.6),
                timestamp: Date()
            )
        } else {
            return SpeakingState(
                isSpeaking: false,
                speakerId: .unknown,
                volume: 0,
                timestamp: Date()
            )
        }
    }

    private func generateExpression(energy: Double, jitter: Double) -> FacialExpression {
        let adjustedEnergy = (energy + Double.random(in: -jitter...jitter)).clamped(to: 0...1)

        let valence: Double
        let expression: ExpressionType

        if adjustedEnergy > 0.7 {
            valence = Double.random(in: 0.3...0.8)
            expression = .happy
        } else if adjustedEnergy > 0.4 {
            valence = Double.random(in: -0.1...0.3)
            expression = Bool.random() ? .focused : .neutral
        } else {
            valence = Double.random(in: -0.5...0)
            expression = [.bored, .confused, .neutral].randomElement()!
        }

        return FacialExpression(
            valence: valence,
            arousal: adjustedEnergy,
            dominantExpression: expression,
            timestamp: Date()
        )
    }
}

// MARK: - Session Scenarios

enum SessionScenario {
    case realistic      // Full session with natural engagement flow
    case highEngagement // Everything goes well
    case declining      // Engagement drops over time (triggers nudges)
    case interactive    // Lots of back-and-forth

    func phase(at elapsed: TimeInterval) -> SessionPhase {
        switch self {
        case .realistic:
            return realisticPhase(at: elapsed)
        case .highEngagement:
            return highEngagementPhase(at: elapsed)
        case .declining:
            return decliningPhase(at: elapsed)
        case .interactive:
            return interactivePhase(at: elapsed)
        }
    }

    // MARK: - Realistic Scenario
    // Warmup → Good engagement → Tutor lecture → Student drifts → Recovery → Wrap up

    private func realisticPhase(at t: TimeInterval) -> SessionPhase {
        if t < 15 {
            // Warmup: getting settled
            return SessionPhase(
                name: "Warmup",
                tutorEyeContact: 0.7, studentEyeContact: 0.5,
                tutorTalkRatio: 0.6, studentTalkRatio: 0.2,
                tutorEnergy: 0.6, studentEnergy: 0.5,
                interruptionProbability: 0.02
            )
        } else if t < 45 {
            // Good engagement
            return SessionPhase(
                name: "Engaged",
                tutorEyeContact: 0.85, studentEyeContact: 0.75,
                tutorTalkRatio: 0.45, studentTalkRatio: 0.35,
                tutorEnergy: 0.75, studentEnergy: 0.7,
                interruptionProbability: 0.05
            )
        } else if t < 75 {
            // Tutor lecturing too much
            return SessionPhase(
                name: "Lecture",
                tutorEyeContact: 0.8, studentEyeContact: 0.4,
                tutorTalkRatio: 0.85, studentTalkRatio: 0.05,
                tutorEnergy: 0.7, studentEnergy: 0.35,
                interruptionProbability: 0.01
            )
        } else if t < 105 {
            // Student drifting - low attention
            return SessionPhase(
                name: "Drift",
                tutorEyeContact: 0.75, studentEyeContact: 0.2,
                tutorTalkRatio: 0.7, studentTalkRatio: 0.05,
                tutorEnergy: 0.5, studentEnergy: 0.25,
                interruptionProbability: 0.0
            )
        } else if t < 135 {
            // Recovery - tutor asks questions
            return SessionPhase(
                name: "Recovery",
                tutorEyeContact: 0.85, studentEyeContact: 0.65,
                tutorTalkRatio: 0.35, studentTalkRatio: 0.45,
                tutorEnergy: 0.75, studentEnergy: 0.65,
                interruptionProbability: 0.08
            )
        } else {
            // Great finish
            return SessionPhase(
                name: "Strong Finish",
                tutorEyeContact: 0.9, studentEyeContact: 0.8,
                tutorTalkRatio: 0.4, studentTalkRatio: 0.4,
                tutorEnergy: 0.85, studentEnergy: 0.8,
                interruptionProbability: 0.03
            )
        }
    }

    private func highEngagementPhase(at t: TimeInterval) -> SessionPhase {
        SessionPhase(
            name: "High Engagement",
            tutorEyeContact: 0.9, studentEyeContact: 0.85,
            tutorTalkRatio: 0.4, studentTalkRatio: 0.4,
            tutorEnergy: 0.85, studentEnergy: 0.8,
            interruptionProbability: 0.03
        )
    }

    private func decliningPhase(at t: TimeInterval) -> SessionPhase {
        let decay = max(0.1, 1.0 - (t / 120.0)) // Decays over 2 minutes
        return SessionPhase(
            name: "Declining",
            tutorEyeContact: 0.8 * decay + 0.1,
            studentEyeContact: 0.7 * decay + 0.05,
            tutorTalkRatio: 0.5 + (1 - decay) * 0.35,
            studentTalkRatio: 0.3 * decay,
            tutorEnergy: 0.7 * decay + 0.15,
            studentEnergy: 0.6 * decay + 0.1,
            interruptionProbability: 0.01
        )
    }

    private func interactivePhase(at t: TimeInterval) -> SessionPhase {
        // Alternates who's speaking every ~10 seconds
        let cycle = sin(t / 5.0)
        let tutorDominant = cycle > 0
        return SessionPhase(
            name: "Interactive",
            tutorEyeContact: 0.8, studentEyeContact: 0.75,
            tutorTalkRatio: tutorDominant ? 0.6 : 0.2,
            studentTalkRatio: tutorDominant ? 0.2 : 0.6,
            tutorEnergy: 0.75, studentEnergy: 0.7,
            interruptionProbability: 0.1
        )
    }
}

struct SessionPhase {
    let name: String
    let tutorEyeContact: Double
    let studentEyeContact: Double
    let tutorTalkRatio: Double
    let studentTalkRatio: Double
    let tutorEnergy: Double
    let studentEnergy: Double
    let interruptionProbability: Double
}

// MARK: - Double Clamping

extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
