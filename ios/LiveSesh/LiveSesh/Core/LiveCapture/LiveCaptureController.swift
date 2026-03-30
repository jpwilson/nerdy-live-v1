import Foundation
import Combine
#if os(iOS)
@preconcurrency import AVFoundation
#endif

enum LiveCaptureStatus: Equatable {
    case idle
    case requestingPermissions
    case ready
    case running
    case unauthorized(String)
    case failed(String)
    case unsupported(String)

    var message: String? {
        switch self {
        case .idle, .ready, .running:
            return nil
        case .requestingPermissions:
            return "Requesting camera and microphone access..."
        case .unauthorized(let message),
             .failed(let message),
             .unsupported(let message):
            return message
        }
    }
}

@MainActor
final class LiveCaptureController: ObservableObject {
    @Published private(set) var status: LiveCaptureStatus = .idle
    @Published private(set) var isRunning = false

    /// When true, the front camera feed is analyzed as both tutor AND student
    /// (self-analysis mode for solo testing). When false, the front camera is
    /// analyzed as tutor only; student metrics come from the WebRTC stream.
    var testModeEnabled = false

    #if os(iOS)
    let captureSession = AVCaptureSession()

    private let metricsEngine: MetricsEngineProtocol
    let videoProcessor: VideoProcessorProtocol
    private let audioProcessor: AudioProcessorProtocol
    private let captureQueue = DispatchQueue(label: "com.livesesh.capture", qos: .userInitiated)
    private var videoOutputDelegate: CameraVideoOutputDelegate?
    private var audioOutputDelegate: CaptureAudioOutputDelegate?
    private var cancellables = Set<AnyCancellable>()
    private var isConfigured = false

    init(metricsEngine: MetricsEngineProtocol,
         videoProcessor: VideoProcessorProtocol = VideoProcessor(),
         audioProcessor: AudioProcessorProtocol = AudioProcessor()) {
        self.metricsEngine = metricsEngine
        self.videoProcessor = videoProcessor
        self.audioProcessor = audioProcessor
        bindProcessorOutputs()
    }

    func start() async -> Bool {
        status = .requestingPermissions

        let permissionsGranted = await requestPermissions()
        guard permissionsGranted else {
            status = .unauthorized("Camera or microphone access is disabled. Enable both in Settings to analyze a live session.")
            return false
        }

        do {
            try configureAudioSession()
            try configureCaptureSessionIfNeeded()
        } catch {
            status = .failed("Live capture could not be started: \(error.localizedDescription)")
            return false
        }

        videoProcessor.startProcessing()
        // Audio is routed through AVCaptureSession (not AVAudioEngine) to avoid
        // hardware conflicts. Buffers arrive via CaptureAudioOutputDelegate.

        captureQueue.async { [captureSession] in
            if !captureSession.isRunning {
                captureSession.startRunning()
            }
        }

        status = .running
        isRunning = true
        return true
    }

    func stop() {
        videoProcessor.stopProcessing()

        captureQueue.async { [captureSession] in
            if captureSession.isRunning {
                captureSession.stopRunning()
            }
        }

        isRunning = false
        status = isConfigured ? .ready : .idle
    }

    private func bindProcessorOutputs() {
        videoProcessor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                guard let self else { return }
                self.metricsEngine.processGaze(gaze, for: .tutor)
                if self.testModeEnabled {
                    // In test mode, the front camera doubles as the student feed
                    self.metricsEngine.processGaze(gaze, for: .student)
                }
            }
            .store(in: &cancellables)

        videoProcessor.expressionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] expression in
                guard let self else { return }
                self.metricsEngine.processExpression(expression, for: .tutor)
                if self.testModeEnabled {
                    self.metricsEngine.processExpression(expression, for: .student)
                }
            }
            .store(in: &cancellables)

        audioProcessor.audioLevelPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] level in
                self?.metricsEngine.processAudioLevel(level)
            }
            .store(in: &cancellables)

        audioProcessor.speakingStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }

                let normalizedState: SpeakingState
                if state.isSpeaking && state.speakerId == .unknown {
                    normalizedState = SpeakingState(
                        isSpeaking: true,
                        speakerId: .tutor,
                        volume: state.volume,
                        timestamp: state.timestamp
                    )
                } else {
                    normalizedState = state
                }

                self.metricsEngine.processSpeaking(normalizedState)

                // In test mode, mirror speaking state as student too
                if self.testModeEnabled {
                    let studentState = SpeakingState(
                        isSpeaking: normalizedState.isSpeaking,
                        speakerId: .student,
                        volume: normalizedState.volume,
                        timestamp: normalizedState.timestamp
                    )
                    self.metricsEngine.processSpeaking(studentState)
                }
            }
            .store(in: &cancellables)
    }

    private func configureAudioSession() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .videoChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try audioSession.setActive(true)
    }

    private func configureCaptureSessionIfNeeded() throws {
        guard !isConfigured else { return }

        captureSession.beginConfiguration()
        captureSession.sessionPreset = .high

        defer {
            captureSession.commitConfiguration()
        }

        let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)

        guard let device else {
            throw LiveCaptureError.cameraUnavailable
        }

        let input = try AVCaptureDeviceInput(device: device)
        guard captureSession.canAddInput(input) else {
            throw LiveCaptureError.inputUnavailable
        }
        captureSession.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
        ]

        let delegate = CameraVideoOutputDelegate { [weak self] sampleBuffer in
            self?.videoProcessor.processFrame(sampleBuffer)
        }
        videoOutputDelegate = delegate
        output.setSampleBufferDelegate(delegate, queue: captureQueue)

        guard captureSession.canAddOutput(output) else {
            throw LiveCaptureError.outputUnavailable
        }
        captureSession.addOutput(output)

        if let connection = output.connection(with: .video) {
            if #available(iOS 17.0, *) {
                if connection.isVideoRotationAngleSupported(90) {
                    connection.videoRotationAngle = 90 // portrait
                }
            } else {
                if connection.isVideoOrientationSupported {
                    connection.videoOrientation = .portrait
                }
            }
            if connection.isVideoMirroringSupported {
                // Keep analysis frames unmirrored so Vision gaze/expression
                // detection reports correct left/right directions.
                // The AVCaptureVideoPreviewLayer mirrors independently for
                // the natural selfie-style preview the user sees.
                connection.isVideoMirrored = false
            }
        }

        // Audio input – routed through AVCaptureSession so it shares the hardware
        // session with video and avoids the AVAudioEngine mic conflict.
        if let audioDevice = AVCaptureDevice.default(for: .audio),
           let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
           captureSession.canAddInput(audioInput) {
            captureSession.addInput(audioInput)

            let audioOutput = AVCaptureAudioDataOutput()
            let audioDelegate = CaptureAudioOutputDelegate { [weak self] sampleBuffer in
                self?.audioProcessor.processAudioSampleBuffer(sampleBuffer)
            }
            audioOutputDelegate = audioDelegate
            audioOutput.setSampleBufferDelegate(audioDelegate, queue: captureQueue)

            if captureSession.canAddOutput(audioOutput) {
                captureSession.addOutput(audioOutput)
            }
        }

        isConfigured = true
        status = .ready
    }

    private func requestPermissions() async -> Bool {
        let videoGranted = await requestVideoPermission()
        let audioGranted = await requestAudioPermission()
        return videoGranted && audioGranted
    }

    private func requestVideoPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            return true
        case .denied, .restricted:
            return false
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    private func requestAudioPermission() async -> Bool {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                return true
            case .denied:
                return false
            case .undetermined:
                return (try? await AVAudioApplication.requestRecordPermission()) ?? false
            @unknown default:
                return false
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                return true
            case .denied:
                return false
            case .undetermined:
                return await withCheckedContinuation { continuation in
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        continuation.resume(returning: granted)
                    }
                }
            @unknown default:
                return false
            }
        }
    }
    #else
    init(metricsEngine: MetricsEngineProtocol,
         videoProcessor: VideoProcessorProtocol = VideoProcessor(),
         audioProcessor: AudioProcessorProtocol = AudioProcessor()) {
        status = .unsupported("Live capture is only available on iOS builds.")
    }

    func start() async -> Bool {
        status = .unsupported("Live capture is only available on iOS builds.")
        return false
    }

    func stop() {
        isRunning = false
    }
    #endif
}

#if os(iOS)
private final class CameraVideoOutputDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let onFrame: (CMSampleBuffer) -> Void

    init(onFrame: @escaping (CMSampleBuffer) -> Void) {
        self.onFrame = onFrame
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        onFrame(sampleBuffer)
    }
}

private final class CaptureAudioOutputDelegate: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let onBuffer: (CMSampleBuffer) -> Void

    init(onBuffer: @escaping (CMSampleBuffer) -> Void) {
        self.onBuffer = onBuffer
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        onBuffer(sampleBuffer)
    }
}

private enum LiveCaptureError: LocalizedError {
    case cameraUnavailable
    case inputUnavailable
    case outputUnavailable

    var errorDescription: String? {
        switch self {
        case .cameraUnavailable:
            return "No compatible camera was found on this device."
        case .inputUnavailable:
            return "The camera input could not be attached to the session."
        case .outputUnavailable:
            return "The video output could not be attached to the session."
        }
    }
}
#endif
