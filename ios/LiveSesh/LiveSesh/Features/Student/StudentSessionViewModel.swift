import Foundation
import Combine
#if canImport(WebRTC)
@preconcurrency import WebRTC
#endif
#if canImport(LiveKit)
import LiveKit
#endif

@MainActor
final class StudentSessionViewModel: ObservableObject {
    enum SessionState: Equatable {
        case idle
        case checkingRoom
        case waitingForTutor
        case inCall
        case disconnected
    }

    @Published var sessionState: SessionState = .idle
    @Published var roomCode = ""
    @Published var errorMessage: String?
    @Published var tutorDisplayName: String?

    // Self-metrics from local camera
    @Published var selfEyeContact: Double = 0

    private var cancellables = Set<AnyCancellable>()

    #if canImport(LiveKit)
    let liveKitService = LiveKitService()
    private var localVideoProcessor: VideoProcessor?
    private var localFrameExtractor: LiveKitFrameExtractor?
    #endif

    #if canImport(WebRTC)
    let webRTCService: WebRTCService = WebRTCService()
    private var webrtcLocalVideoProcessor: VideoProcessor?
    private var webrtcLocalFrameExtractor: WebRTCFrameExtractor?
    #endif

    init() {
        setupSubscriptions()
    }

    private func setupSubscriptions() {
        #if canImport(LiveKit)
        liveKitService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }
                switch state {
                case .idle:
                    break
                case .connecting:
                    self.sessionState = .checkingRoom
                case .waitingForStudent:
                    self.sessionState = .waitingForTutor
                case .studentConnected:
                    self.sessionState = .inCall
                    self.tutorDisplayName = self.liveKitService.remotePeerDisplayName
                case .disconnected:
                    if self.sessionState == .inCall {
                        self.sessionState = .disconnected
                    }
                }
            }
            .store(in: &cancellables)

        liveKitService.$localVideoTrack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] track in
                if let track {
                    self?.attachLiveKitLocalVideoAnalysis(to: track)
                } else {
                    self?.detachLiveKitLocalVideoAnalysis()
                }
            }
            .store(in: &cancellables)
        #elseif canImport(WebRTC)
        webRTCService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }
                switch state {
                case .idle:
                    break
                case .connecting:
                    self.sessionState = .checkingRoom
                case .waitingForStudent:
                    self.sessionState = .waitingForTutor
                case .studentConnected:
                    self.sessionState = .inCall
                    self.tutorDisplayName = self.webRTCService.studentDisplayName
                case .disconnected:
                    if self.sessionState == .inCall {
                        self.sessionState = .disconnected
                    }
                }
            }
            .store(in: &cancellables)

        webRTCService.$localVideoTrack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] track in
                if let track {
                    self?.attachWebRTCLocalVideoAnalysis(to: track)
                } else {
                    self?.detachWebRTCLocalVideoAnalysis()
                }
            }
            .store(in: &cancellables)
        #endif
    }

    func joinRoom(accessToken: String?) async {
        let code = roomCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else {
            errorMessage = "Please enter a room code."
            return
        }

        errorMessage = nil
        sessionState = .checkingRoom

        #if canImport(LiveKit)
        await liveKitService.connect(
            roomId: code,
            displayName: "Student",
            accessToken: accessToken,
            role: "student"
        )
        #elseif canImport(WebRTC)
        await webRTCService.connect(
            roomId: code,
            displayName: "Student",
            accessToken: accessToken,
            role: "student"
        )
        #endif
    }

    func leaveRoom() {
        #if canImport(LiveKit)
        liveKitService.disconnect()
        detachLiveKitLocalVideoAnalysis()
        #elseif canImport(WebRTC)
        webRTCService.disconnect()
        detachWebRTCLocalVideoAnalysis()
        #endif
        sessionState = .idle
        tutorDisplayName = nil
        selfEyeContact = 0
    }

    // MARK: - LiveKit Local Video Analysis

    #if canImport(LiveKit)
    private func attachLiveKitLocalVideoAnalysis(to track: VideoTrack) {
        detachLiveKitLocalVideoAnalysis()

        let processor = VideoProcessor(analyzeEveryNFrames: 1)
        processor.startProcessing()

        processor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                self?.selfEyeContact = gaze.isLookingAtCamera ? 1.0 : max(0, gaze.confidence)
            }
            .store(in: &cancellables)

        let extractor = LiveKitFrameExtractor(deliverEveryNFrames: 6)
        extractor.onFrame = { [weak processor] pixelBuffer in
            processor?.processPixelBuffer(pixelBuffer)
        }
        extractor.attach(to: track)

        localVideoProcessor = processor
        localFrameExtractor = extractor
    }

    private func detachLiveKitLocalVideoAnalysis() {
        localFrameExtractor?.detach()
        localFrameExtractor = nil
        localVideoProcessor?.stopProcessing()
        localVideoProcessor = nil
    }
    #endif

    // MARK: - WebRTC Local Video Analysis (fallback)

    #if canImport(WebRTC)
    private func attachWebRTCLocalVideoAnalysis(to track: RTCVideoTrack) {
        detachWebRTCLocalVideoAnalysis()

        let processor = VideoProcessor(analyzeEveryNFrames: 1)
        processor.startProcessing()

        processor.gazeEstimationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gaze in
                self?.selfEyeContact = gaze.isLookingAtCamera ? 1.0 : max(0, gaze.confidence)
            }
            .store(in: &cancellables)

        let extractor = WebRTCFrameExtractor(deliverEveryNFrames: 6)
        extractor.onFrame = { [weak processor] pixelBuffer in
            processor?.processPixelBuffer(pixelBuffer)
        }
        extractor.attach(to: track)

        webrtcLocalVideoProcessor = processor
        webrtcLocalFrameExtractor = extractor
    }

    private func detachWebRTCLocalVideoAnalysis() {
        webrtcLocalFrameExtractor?.detach()
        webrtcLocalFrameExtractor = nil
        webrtcLocalVideoProcessor?.stopProcessing()
        webrtcLocalVideoProcessor = nil
    }
    #endif
}
