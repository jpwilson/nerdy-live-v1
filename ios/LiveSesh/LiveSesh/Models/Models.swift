import Foundation

// MARK: - Supabase Configuration (non-isolated, safe to access from any context)

enum SupabaseConfig {
    static let url = "https://gmpqbrvqyhvrjprynvse.supabase.co"
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcHFicnZxeWh2cmpwcnludnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjc2MzgsImV4cCI6MjA4ODg0MzYzOH0.Asl68-9BJkahQErCBA3VXI4LQdmuEuKJN5E4lE13Thc"
}

// MARK: - Session Models

struct LiveSession: Identifiable, Codable, Equatable {
    let id: UUID
    var tutorId: UUID
    var studentId: UUID?
    var subject: String
    var studentLevel: StudentLevel
    var startedAt: Date
    var endedAt: Date?
    var engagementScore: Double?

    var durationMinutes: Int? {
        guard let endedAt else { return nil }
        return Int(endedAt.timeIntervalSince(startedAt) / 60)
    }

    var isActive: Bool { endedAt == nil }

    static func new(tutorId: UUID, subject: String, level: StudentLevel) -> LiveSession {
        LiveSession(
            id: UUID(),
            tutorId: tutorId,
            subject: subject,
            studentLevel: level,
            startedAt: Date()
        )
    }
}

enum StudentLevel: String, Codable, CaseIterable {
    case elementary = "Elementary"
    case middleSchool = "Middle School"
    case highSchool = "High School"
    case college = "College"
    case graduate = "Graduate"
    case professional = "Professional"
}

// MARK: - Metrics Models

struct EngagementMetrics: Codable, Equatable {
    var tutor: ParticipantMetrics
    var student: ParticipantMetrics
    var session: SessionMetrics
    var timestamp: Date

    static let empty = EngagementMetrics(
        tutor: .empty,
        student: .empty,
        session: .empty,
        timestamp: Date()
    )
}

struct ParticipantMetrics: Codable, Equatable {
    var eyeContactScore: Double
    var talkTimePercent: Double
    var energyScore: Double
    var isSpeaking: Bool
    var attentionDrift: Double

    init(eyeContactScore: Double, talkTimePercent: Double, energyScore: Double,
         isSpeaking: Bool, attentionDrift: Double = 0.0) {
        self.eyeContactScore = eyeContactScore
        self.talkTimePercent = talkTimePercent
        self.energyScore = energyScore
        self.isSpeaking = isSpeaking
        self.attentionDrift = attentionDrift
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        eyeContactScore = try container.decode(Double.self, forKey: .eyeContactScore)
        talkTimePercent = try container.decode(Double.self, forKey: .talkTimePercent)
        energyScore = try container.decode(Double.self, forKey: .energyScore)
        isSpeaking = try container.decode(Bool.self, forKey: .isSpeaking)
        attentionDrift = try container.decodeIfPresent(Double.self, forKey: .attentionDrift) ?? 0.0
    }

    static let empty = ParticipantMetrics(
        eyeContactScore: 0,
        talkTimePercent: 0,
        energyScore: 0,
        isSpeaking: false,
        attentionDrift: 0.0
    )
}

struct SessionMetrics: Codable, Equatable {
    var interruptionCount: Int
    var silenceDurationCurrent: TimeInterval
    var engagementTrend: EngagementTrend

    static let empty = SessionMetrics(
        interruptionCount: 0,
        silenceDurationCurrent: 0,
        engagementTrend: .stable
    )
}

enum EngagementTrend: String, Codable, Equatable {
    case rising
    case stable
    case declining
}

// MARK: - Metrics Snapshot (for storage)

struct MetricsSnapshot: Identifiable, Codable, Equatable {
    let id: UUID
    let sessionId: UUID
    let timestamp: Date
    let tutorEyeContact: Double
    let studentEyeContact: Double
    let tutorTalkPct: Double
    let studentTalkPct: Double
    let tutorEnergy: Double
    let studentEnergy: Double
    let interruptionCount: Int
    let engagementTrend: EngagementTrend

    init(from metrics: EngagementMetrics, sessionId: UUID) {
        self.id = UUID()
        self.sessionId = sessionId
        self.timestamp = metrics.timestamp
        self.tutorEyeContact = metrics.tutor.eyeContactScore
        self.studentEyeContact = metrics.student.eyeContactScore
        self.tutorTalkPct = metrics.tutor.talkTimePercent
        self.studentTalkPct = metrics.student.talkTimePercent
        self.tutorEnergy = metrics.tutor.energyScore
        self.studentEnergy = metrics.student.energyScore
        self.interruptionCount = metrics.session.interruptionCount
        self.engagementTrend = metrics.session.engagementTrend
    }

    init(id: UUID = UUID(), sessionId: UUID, timestamp: Date, tutorEyeContact: Double,
         studentEyeContact: Double, tutorTalkPct: Double, studentTalkPct: Double,
         tutorEnergy: Double, studentEnergy: Double, interruptionCount: Int,
         engagementTrend: EngagementTrend) {
        self.id = id
        self.sessionId = sessionId
        self.timestamp = timestamp
        self.tutorEyeContact = tutorEyeContact
        self.studentEyeContact = studentEyeContact
        self.tutorTalkPct = tutorTalkPct
        self.studentTalkPct = studentTalkPct
        self.tutorEnergy = tutorEnergy
        self.studentEnergy = studentEnergy
        self.interruptionCount = interruptionCount
        self.engagementTrend = engagementTrend
    }
}

// MARK: - Coaching Models

struct CoachingNudge: Identifiable, Codable, Equatable {
    let id: UUID
    let sessionId: UUID
    let timestamp: Date
    let nudgeType: NudgeType
    let message: String
    let priority: NudgePriority
    var wasDismissed: Bool
    let triggerData: [String: Double]

    init(sessionId: UUID, type: NudgeType, message: String,
         priority: NudgePriority, triggerData: [String: Double] = [:]) {
        self.id = UUID()
        self.sessionId = sessionId
        self.timestamp = Date()
        self.nudgeType = type
        self.message = message
        self.priority = priority
        self.wasDismissed = false
        self.triggerData = triggerData
    }
}

enum NudgeType: String, Codable, Equatable {
    case engagementCheck = "engagement_check"
    case attentionAlert = "attention_alert"
    case talkTimeBalance = "talk_time_balance"
    case energyDrop = "energy_drop"
    case interruptionSpike = "interruption_spike"
    case positiveReinforcement = "positive_reinforcement"
}

enum NudgePriority: String, Codable, Equatable, Comparable {
    case low
    case medium
    case high

    static func < (lhs: NudgePriority, rhs: NudgePriority) -> Bool {
        let order: [NudgePriority] = [.low, .medium, .high]
        return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
    }
}

// MARK: - Post-Session Analytics

struct SessionSummary: Identifiable, Codable, Equatable {
    let id: UUID
    let sessionId: UUID
    let durationMinutes: Int
    let talkTimeRatio: TalkTimeRatio
    let avgEyeContact: EyeContactSummary
    let totalInterruptions: Int
    let engagementScore: Double
    let keyMoments: [KeyMoment]
    let recommendations: [String]
    let createdAt: Date
    var batteryUsage: BatteryUsage?
}

struct BatteryUsage: Codable, Equatable {
    let startLevel: Double   // 0.0–1.0
    let endLevel: Double     // 0.0–1.0
    var percentUsed: Double { max(0, (startLevel - endLevel) * 100) }
    var wasCharging: Bool
}

struct TalkTimeRatio: Codable, Equatable {
    let tutor: Double
    let student: Double
}

struct EyeContactSummary: Codable, Equatable {
    let tutor: Double
    let student: Double
}

struct KeyMoment: Codable, Equatable, Identifiable {
    var id: String { "\(timestamp)-\(type)" }
    let timestamp: String
    let type: String
    let description: String
}

enum KeyMomentType: String {
    case attentionDrift = "attention_drift"
    case prolongedSilence = "prolonged_silence"
    case engagementDecline = "engagement_decline"
    case interruptionSpike = "interruption_spike"
}

// MARK: - Tutor Profile

struct TutorProfile: Codable, Equatable {
    let id: UUID
    var name: String
    var email: String
    var totalSessions: Int
    var averageEngagement: Double
    var coachingScore: Double
}

// MARK: - WebRTC Connection State

enum WebRTCConnectionState: String, Equatable {
    case idle
    case connecting
    case waitingForStudent
    case studentConnected
    case disconnected

    var displayLabel: String {
        switch self {
        case .idle: return "Not Connected"
        case .connecting: return "Connecting..."
        case .waitingForStudent: return "Waiting for Student"
        case .studentConnected: return "Student Connected"
        case .disconnected: return "Disconnected"
        }
    }

    var isActive: Bool {
        switch self {
        case .waitingForStudent, .studentConnected: return true
        default: return false
        }
    }
}

// MARK: - Coaching Configuration

struct CoachingConfig: Codable, Equatable {
    var sensitivity: CoachingSensitivity
    var nudgeCooldownSeconds: TimeInterval
    var enabledNudgeTypes: Set<NudgeType>
    var silenceThresholdSeconds: TimeInterval
    var eyeContactThreshold: Double
    var talkTimeImbalanceThreshold: Double
    var energyDropThreshold: Double
    var interruptionSpikeCount: Int

    static let `default` = CoachingConfig(
        sensitivity: .medium,
        nudgeCooldownSeconds: 60,
        enabledNudgeTypes: Set(NudgeType.allCases),
        silenceThresholdSeconds: 180,
        eyeContactThreshold: 0.30,
        talkTimeImbalanceThreshold: 0.80,
        energyDropThreshold: 0.20,
        interruptionSpikeCount: 3
    )

    static let low = CoachingConfig(
        sensitivity: .low,
        nudgeCooldownSeconds: 120,
        enabledNudgeTypes: [.engagementCheck, .attentionAlert],
        silenceThresholdSeconds: 300,
        eyeContactThreshold: 0.20,
        talkTimeImbalanceThreshold: 0.90,
        energyDropThreshold: 0.30,
        interruptionSpikeCount: 5
    )

    static let high = CoachingConfig(
        sensitivity: .high,
        nudgeCooldownSeconds: 30,
        enabledNudgeTypes: Set(NudgeType.allCases),
        silenceThresholdSeconds: 120,
        eyeContactThreshold: 0.40,
        talkTimeImbalanceThreshold: 0.70,
        energyDropThreshold: 0.15,
        interruptionSpikeCount: 2
    )
}

enum CoachingSensitivity: String, Codable, CaseIterable {
    case low = "Low"
    case medium = "Medium"
    case high = "High"
}

extension NudgeType: CaseIterable {}
extension NudgeType: Hashable {}
