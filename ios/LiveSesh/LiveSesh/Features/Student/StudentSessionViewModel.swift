import Foundation
import Combine
#if canImport(WebRTC)
@preconcurrency import WebRTC
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

    #if canImport(WebRTC)
    let webRTCService: WebRTCService
    private var localVideoProcessor: VideoProcessor?
    private var localFrameExtractor: WebRTCFrameExtractor?
    private var cancellables = Set<AnyCancellable>()

    init() {
        self.webRTCService = WebRTCService()
        setupSubscriptions()
    }

    private func setupSubscriptions() {
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
                    // As student, "waitingForStudent" means we're looking for tutor
                    self.sessionState = .waitingForTutor
                case .studentConnected:
                    // Peer connected — we're in call
                    self.sessionState = .inCall
                    self.tutorDisplayName = self.webRTCService.studentDisplayName
                case .disconnected:
                    if self.sessionState == .inCall {
                        self.sessionState = .disconnected
                    }
                }
            }
            .store(in: &cancellables)

        // Extract self eye-contact from local video track
        webRTCService.$localVideoTrack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] track in
                if let track {
                    self?.attachLocalVideoAnalysis(to: track)
                } else {
                    self?.detachLocalVideoAnalysis()
                }
            }
            .store(in: &cancellables)
    }

    func joinRoom(accessToken: String?) async {
        let code = roomCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else {
            errorMessage = "Please enter a room code."
            return
        }

        errorMessage = nil
        sessionState = .checkingRoom

        await webRTCService.connect(
            roomId: code,
            displayName: "Student",
            accessToken: accessToken,
            role: "student"
        )
    }

    func leaveRoom() {
        webRTCService.disconnect()
        detachLocalVideoAnalysis()
        sessionState = .idle
        tutorDisplayName = nil
        selfEyeContact = 0
    }

    private func attachLocalVideoAnalysis(to track: RTCVideoTrack) {
        detachLocalVideoAnalysis()

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

        localVideoProcessor = processor
        localFrameExtractor = extractor
    }

    private func detachLocalVideoAnalysis() {
        localFrameExtractor?.detach()
        localFrameExtractor = nil
        localVideoProcessor?.stopProcessing()
        localVideoProcessor = nil
    }
    #else
    init() {}

    func joinRoom(accessToken: String?) async {
        errorMessage = "WebRTC not available on this platform."
    }

    func leaveRoom() {
        sessionState = .idle
    }
    #endif
}
