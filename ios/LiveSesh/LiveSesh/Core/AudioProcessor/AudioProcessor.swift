import Foundation
import AVFoundation
import Combine

protocol AudioProcessorProtocol: AnyObject {
    var speakingStatePublisher: AnyPublisher<SpeakingState, Never> { get }
    var audioLevelPublisher: AnyPublisher<AudioLevel, Never> { get }
    var isProcessing: Bool { get }

    func startProcessing()
    func stopProcessing()
}

// MARK: - Output Models

struct SpeakingState: Equatable {
    let isSpeaking: Bool
    let speakerId: SpeakerRole
    let volume: Double
    let timestamp: Date

    static let silent = SpeakingState(
        isSpeaking: false, speakerId: .unknown, volume: 0, timestamp: Date()
    )
}

enum SpeakerRole: String, Codable, Equatable {
    case tutor
    case student
    case unknown
}

struct AudioLevel: Equatable {
    let averagePower: Double
    let peakPower: Double
    let timestamp: Date

    static let silent = AudioLevel(averagePower: -160, peakPower: -160, timestamp: Date())
}

// MARK: - Voice Activity Detection

final class VoiceActivityDetector {
    private let silenceThreshold: Double
    private let speechThreshold: Double
    private var consecutiveSpeechFrames = 0
    private var consecutiveSilenceFrames = 0
    private let minSpeechFrames: Int
    private let minSilenceFrames: Int

    init(silenceThreshold: Double = -40, speechThreshold: Double = -30,
         minSpeechFrames: Int = 3, minSilenceFrames: Int = 10) {
        self.silenceThreshold = silenceThreshold
        self.speechThreshold = speechThreshold
        self.minSpeechFrames = minSpeechFrames
        self.minSilenceFrames = minSilenceFrames
    }

    func detect(averagePower: Double) -> Bool {
        if averagePower > speechThreshold {
            consecutiveSpeechFrames += 1
            consecutiveSilenceFrames = 0
        } else if averagePower < silenceThreshold {
            consecutiveSilenceFrames += 1
            consecutiveSpeechFrames = 0
        }

        if consecutiveSpeechFrames >= minSpeechFrames {
            return true
        } else if consecutiveSilenceFrames >= minSilenceFrames {
            return false
        }

        // Maintain previous state in ambiguous zone
        return consecutiveSpeechFrames > consecutiveSilenceFrames
    }

    func reset() {
        consecutiveSpeechFrames = 0
        consecutiveSilenceFrames = 0
    }
}

// MARK: - Speaker Diarization (Simple Energy-Based)

final class SimpleSpeakerDiarizer {
    private var tutorEnergyProfile: Double?
    private var studentEnergyProfile: Double?
    private var calibrationSamples: [Double] = []
    private var isCalibrated = false

    func calibrateTutor(averageEnergy: Double) {
        tutorEnergyProfile = averageEnergy
        checkCalibration()
    }

    func calibrateStudent(averageEnergy: Double) {
        studentEnergyProfile = averageEnergy
        checkCalibration()
    }

    private func checkCalibration() {
        isCalibrated = tutorEnergyProfile != nil && studentEnergyProfile != nil
    }

    func identifySpeaker(energy: Double) -> SpeakerRole {
        guard isCalibrated,
              let tutorProfile = tutorEnergyProfile,
              let studentProfile = studentEnergyProfile else {
            return .unknown
        }

        let tutorDiff = abs(energy - tutorProfile)
        let studentDiff = abs(energy - studentProfile)

        if tutorDiff < studentDiff {
            return .tutor
        } else {
            return .student
        }
    }

    func reset() {
        tutorEnergyProfile = nil
        studentEnergyProfile = nil
        isCalibrated = false
        calibrationSamples = []
    }
}

// MARK: - Audio Processor Implementation

final class AudioProcessor: AudioProcessorProtocol {
    private let speakingStateSubject = PassthroughSubject<SpeakingState, Never>()
    private let audioLevelSubject = PassthroughSubject<AudioLevel, Never>()

    var speakingStatePublisher: AnyPublisher<SpeakingState, Never> {
        speakingStateSubject.eraseToAnyPublisher()
    }
    var audioLevelPublisher: AnyPublisher<AudioLevel, Never> {
        audioLevelSubject.eraseToAnyPublisher()
    }

    private(set) var isProcessing = false

    private var audioEngine: AVAudioEngine?
    private let vad = VoiceActivityDetector()
    private let diarizer = SimpleSpeakerDiarizer()
    private let processingQueue = DispatchQueue(label: "com.livesesh.audioprocessor", qos: .userInteractive)

    func startProcessing() {
        isProcessing = true
        setupAudioEngine()
    }

    func stopProcessing() {
        isProcessing = false
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        vad.reset()
    }

    private func setupAudioEngine() {
        audioEngine = AVAudioEngine()
        guard let engine = audioEngine else { return }

        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, time in
            self?.processAudioBuffer(buffer)
        }

        do {
            try engine.start()
        } catch {
            isProcessing = false
        }
    }

    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isProcessing else { return }

        let channelData = buffer.floatChannelData?[0]
        let frameLength = Int(buffer.frameLength)

        guard let data = channelData, frameLength > 0 else { return }

        // Calculate RMS power
        var sum: Float = 0
        var peak: Float = 0
        for i in 0..<frameLength {
            let sample = abs(data[i])
            sum += sample * sample
            peak = max(peak, sample)
        }

        let rms = sqrt(sum / Float(frameLength))
        let avgPower = 20 * log10(max(rms, 1e-10))
        let peakPower = 20 * log10(max(peak, 1e-10))

        let level = AudioLevel(
            averagePower: Double(avgPower),
            peakPower: Double(peakPower),
            timestamp: Date()
        )
        audioLevelSubject.send(level)

        let isSpeaking = vad.detect(averagePower: Double(avgPower))
        let speaker = diarizer.identifySpeaker(energy: Double(rms))

        let state = SpeakingState(
            isSpeaking: isSpeaking,
            speakerId: speaker,
            volume: Double(rms),
            timestamp: Date()
        )
        speakingStateSubject.send(state)
    }
}
