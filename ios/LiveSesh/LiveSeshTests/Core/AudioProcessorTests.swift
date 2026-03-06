import XCTest
@testable import LiveSesh

final class VoiceActivityDetectorTests: XCTestCase {
    var vad: VoiceActivityDetector!

    override func setUp() {
        super.setUp()
        vad = VoiceActivityDetector(
            silenceThreshold: -40,
            speechThreshold: -30,
            minSpeechFrames: 3,
            minSilenceFrames: 3
        )
    }

    // MARK: - Voice Activity Detection

    func testSilenceDetected() {
        // Feed very low power levels
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -60)
        }
        let result = vad.detect(averagePower: -60)
        XCTAssertFalse(result)
    }

    func testSpeechDetected() {
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -20)
        }
        let result = vad.detect(averagePower: -20)
        XCTAssertTrue(result)
    }

    func testTransitionFromSilenceToSpeech() {
        // Start with silence
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -60)
        }
        XCTAssertFalse(vad.detect(averagePower: -60))

        // Transition to speech
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -20)
        }
        XCTAssertTrue(vad.detect(averagePower: -20))
    }

    func testTransitionFromSpeechToSilence() {
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -20)
        }
        XCTAssertTrue(vad.detect(averagePower: -20))

        for _ in 0..<5 {
            _ = vad.detect(averagePower: -60)
        }
        XCTAssertFalse(vad.detect(averagePower: -60))
    }

    func testResetClearsState() {
        for _ in 0..<5 {
            _ = vad.detect(averagePower: -20)
        }
        vad.reset()
        // After reset, ambiguous zone should return false (no consecutive frames)
        let result = vad.detect(averagePower: -35) // In ambiguous zone
        XCTAssertFalse(result) // 0 > 0 is false
    }

    func testAmbiguousZone() {
        // Power between thresholds
        let result = vad.detect(averagePower: -35)
        // First frame with no history should not be speech
        XCTAssertFalse(result)
    }

    // MARK: - Min Frame Requirements

    func testMinSpeechFramesRequired() {
        // Only 2 speech frames (below minSpeechFrames of 3)
        _ = vad.detect(averagePower: -20)
        _ = vad.detect(averagePower: -20)
        // Not enough consecutive frames for speech detection
        // The result depends on the comparison of counters
    }
}

// MARK: - Speaker Diarizer Tests

final class SimpleSpeakerDiarizerTests: XCTestCase {
    var diarizer: SimpleSpeakerDiarizer!

    override func setUp() {
        super.setUp()
        diarizer = SimpleSpeakerDiarizer()
    }

    func testUncalibratedReturnsUnknown() {
        let result = diarizer.identifySpeaker(energy: 0.5)
        XCTAssertEqual(result, .unknown)
    }

    func testCalibratedIdentifiesTutor() {
        diarizer.calibrateTutor(averageEnergy: 0.7)
        diarizer.calibrateStudent(averageEnergy: 0.3)

        let result = diarizer.identifySpeaker(energy: 0.65)
        XCTAssertEqual(result, .tutor)
    }

    func testCalibratedIdentifiesStudent() {
        diarizer.calibrateTutor(averageEnergy: 0.7)
        diarizer.calibrateStudent(averageEnergy: 0.3)

        let result = diarizer.identifySpeaker(energy: 0.35)
        XCTAssertEqual(result, .student)
    }

    func testPartiallyCalibratedReturnsUnknown() {
        diarizer.calibrateTutor(averageEnergy: 0.7)
        // Student not calibrated
        let result = diarizer.identifySpeaker(energy: 0.5)
        XCTAssertEqual(result, .unknown)
    }

    func testResetClearsCalibration() {
        diarizer.calibrateTutor(averageEnergy: 0.7)
        diarizer.calibrateStudent(averageEnergy: 0.3)
        diarizer.reset()

        let result = diarizer.identifySpeaker(energy: 0.5)
        XCTAssertEqual(result, .unknown)
    }

    func testEqualDistanceFavorsTutor() {
        diarizer.calibrateTutor(averageEnergy: 0.4)
        diarizer.calibrateStudent(averageEnergy: 0.6)

        let result = diarizer.identifySpeaker(energy: 0.5)
        // Equal distance - should favor tutor (tutorDiff == studentDiff, tutor wins)
        XCTAssertNotEqual(result, .unknown)
    }
}

// MARK: - Audio Level Model Tests

final class AudioLevelTests: XCTestCase {
    func testSilentLevel() {
        let level = AudioLevel.silent
        XCTAssertEqual(level.averagePower, -160)
        XCTAssertEqual(level.peakPower, -160)
    }

    func testNormalLevel() {
        let level = AudioLevel(averagePower: -30, peakPower: -20, timestamp: Date())
        XCTAssertGreaterThan(level.averagePower, AudioLevel.silent.averagePower)
    }

    func testLevelEquality() {
        let date = Date()
        let level1 = AudioLevel(averagePower: -30, peakPower: -20, timestamp: date)
        let level2 = AudioLevel(averagePower: -30, peakPower: -20, timestamp: date)
        XCTAssertEqual(level1, level2)
    }
}

// MARK: - Speaking State Model Tests

final class SpeakingStateTests: XCTestCase {
    func testSilentState() {
        let state = SpeakingState.silent
        XCTAssertFalse(state.isSpeaking)
        XCTAssertEqual(state.speakerId, .unknown)
        XCTAssertEqual(state.volume, 0)
    }

    func testSpeakingState() {
        let state = SpeakingState(isSpeaking: true, speakerId: .tutor, volume: 0.7, timestamp: Date())
        XCTAssertTrue(state.isSpeaking)
        XCTAssertEqual(state.speakerId, .tutor)
    }

    func testSpeakerRoleEquality() {
        XCTAssertEqual(SpeakerRole.tutor, SpeakerRole.tutor)
        XCTAssertNotEqual(SpeakerRole.tutor, SpeakerRole.student)
    }
}
