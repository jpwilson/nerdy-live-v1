import Foundation
import AVFoundation
import Combine
import WebRTC

// MARK: - WebRTC Service Protocol

@MainActor
protocol WebRTCServiceProtocol: AnyObject {
    var connectionState: WebRTCConnectionState { get }
    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> { get }
    var studentPresent: Bool { get }
    var studentDisplayName: String? { get }
    var remoteVideoTrack: RTCVideoTrack? { get }
    var localVideoTrack: RTCVideoTrack? { get }

    func connect(roomId: String, displayName: String, accessToken: String?) async
    func disconnect()
}

// MARK: - WebRTC Service (real peer connection + Supabase Realtime signaling)

@MainActor
final class WebRTCService: NSObject, ObservableObject, WebRTCServiceProtocol {
    @Published private(set) var connectionState: WebRTCConnectionState = .idle
    @Published private(set) var studentPresent = false
    @Published private(set) var studentDisplayName: String?
    @Published private(set) var remoteVideoTrack: RTCVideoTrack?
    @Published private(set) var localVideoTrack: RTCVideoTrack?

    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> {
        $connectionState.eraseToAnyPublisher()
    }

    // MARK: - WebRTC objects

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }()

    private var peerConnection: RTCPeerConnection?
    private var delegateProxy: WebRTCDelegateProxy?  // MUST retain — RTCPeerConnection.delegate is weak
    private var videoCapturer: RTCCameraVideoCapturer?
    private var localAudioTrack: RTCAudioTrack?
    fileprivate var makingOffer = false
    fileprivate var isPolite = false
    fileprivate var remotePeerId: String?

    // MARK: - Signaling (Supabase Realtime WebSocket)

    private var webSocketTask: URLSessionWebSocketTask?
    private var heartbeatTimer: Timer?
    private var roomId: String?
    private var localPeerId: String = UUID().uuidString
    private var displayName: String = "Tutor"
    private var channelRef: Int = 0
    private var joinRef: String?
    private var isJoined = false

    private let supabaseURL: String
    private let supabaseAnonKey: String

    // MARK: - Init

    init(supabaseURL: String? = nil, supabaseAnonKey: String? = nil) {
        self.supabaseURL = supabaseURL ?? SupabaseConfig.url
        self.supabaseAnonKey = supabaseAnonKey ?? SupabaseConfig.anonKey
        super.init()
    }

    // MARK: - Public API

    func connect(roomId: String, displayName: String, accessToken: String?) async {
        guard connectionState == .idle || connectionState == .disconnected else { return }

        self.roomId = roomId
        self.displayName = displayName
        connectionState = .connecting

        // 0. Route audio to the loudspeaker (not earpiece)
        configureAudioSession()

        // 1. Create peer connection
        createPeerConnection()

        // 2. Add local media tracks
        addLocalMediaTracks()

        // 3. Start camera capture
        startCameraCapture()

        // 4. Connect to Supabase Realtime signaling channel
        let wsURL = supabaseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")

        let token = accessToken ?? supabaseAnonKey
        let urlString = "\(wsURL)/realtime/v1/websocket?apikey=\(supabaseAnonKey)&vsn=1.0.0"

        guard let url = URL(string: urlString) else {
            connectionState = .disconnected
            return
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: request)
        webSocketTask?.resume()

        receiveMessages()

        try? await Task.sleep(nanoseconds: 500_000_000)

        joinChannel()
        startHeartbeat()
    }

    func disconnect() {
        // Close peer connection
        peerConnection?.delegate = nil
        peerConnection?.close()
        peerConnection = nil
        delegateProxy = nil

        // Stop camera
        videoCapturer?.stopCapture()
        videoCapturer = nil

        remoteVideoTrack = nil
        localVideoTrack = nil
        remotePeerId = nil
        makingOffer = false

        // Close signaling channel
        leaveChannel()
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isJoined = false
        studentPresent = false
        studentDisplayName = nil
        connectionState = .idle
    }

    // MARK: - Audio Session

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
            print("[WebRTCService] Audio session: playAndRecord, defaultToSpeaker")
        } catch {
            print("[WebRTCService] Audio session config failed: \(error.localizedDescription)")
        }
    }

    // MARK: - WebRTC Peer Connection Setup

    private func createPeerConnection() {
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"])
        ]
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        let proxy = WebRTCDelegateProxy(service: self)
        delegateProxy = proxy  // retain the proxy — delegate is weak

        peerConnection = Self.factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: proxy
        )
    }

    private func addLocalMediaTracks() {
        guard let peerConnection else { return }

        // Audio track
        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = Self.factory.audioSource(with: audioConstraints)
        let audioTrack = Self.factory.audioTrack(with: audioSource, trackId: "audio0")
        peerConnection.add(audioTrack, streamIds: ["stream0"])
        localAudioTrack = audioTrack

        // Video track
        let videoSource = Self.factory.videoSource()
        let videoTrack = Self.factory.videoTrack(with: videoSource, trackId: "video0")
        peerConnection.add(videoTrack, streamIds: ["stream0"])
        localVideoTrack = videoTrack

        // Create capturer attached to the video source
        videoCapturer = RTCCameraVideoCapturer(delegate: videoSource)
    }

    private func startCameraCapture() {
        guard let capturer = videoCapturer else { return }

        guard let frontCamera = RTCCameraVideoCapturer.captureDevices().first(where: {
            $0.position == .front
        }) else {
            print("[WebRTCService] No front camera found")
            return
        }

        // Pick a reasonable format (720p or closest)
        let formats = RTCCameraVideoCapturer.supportedFormats(for: frontCamera)
        let targetWidth: Int32 = 1280
        let selectedFormat = formats
            .sorted { a, b in
                let aWidth = CMVideoFormatDescriptionGetDimensions(a.formatDescription).width
                let bWidth = CMVideoFormatDescriptionGetDimensions(b.formatDescription).width
                return abs(aWidth - targetWidth) < abs(bWidth - targetWidth)
            }
            .first ?? formats.last

        guard let format = selectedFormat else { return }

        let fps = format.videoSupportedFrameRateRanges
            .max(by: { $0.maxFrameRate < $1.maxFrameRate })?
            .maxFrameRate ?? 30

        capturer.startCapture(with: frontCamera, format: format, fps: Int(min(fps, 30)))
        print("[WebRTCService] Camera capture started")
    }

    // MARK: - Signaling Channel Management

    private func joinChannel() {
        guard let roomId else { return }

        let topic = "realtime:room:\(roomId):webrtc"
        channelRef += 1
        joinRef = "\(channelRef)"

        let joinPayload: [String: Any] = [
            "config": [
                "presence": ["key": localPeerId],
                "broadcast": ["self": false, "ack": false]
            ]
        ]

        sendWSMessage(topic: topic, event: "phx_join", payload: joinPayload, ref: joinRef)
    }

    private func leaveChannel() {
        guard let roomId, isJoined else { return }
        let topic = "realtime:room:\(roomId):webrtc"
        channelRef += 1
        sendWSMessage(topic: topic, event: "phx_leave", payload: [:], ref: "\(channelRef)")
    }

    private func trackPresence() {
        guard let roomId, isJoined else { return }
        let topic = "realtime:room:\(roomId):webrtc"

        let presencePayload: [String: Any] = [
            "type": "presence",
            "event": "track",
            "payload": [
                "peerId": localPeerId,
                "displayName": displayName,
                "role": "tutor",
                "joinedAt": ISO8601DateFormatter().string(from: Date())
            ]
        ]

        channelRef += 1
        sendWSMessage(topic: topic, event: "presence", payload: presencePayload, ref: "\(channelRef)")
    }

    // MARK: - WebRTC Signaling via Broadcast

    private func sendSignal(kind: String, to peerId: String, description: [String: Any]? = nil, candidate: [String: Any]? = nil) {
        guard let roomId, isJoined else { return }
        let topic = "realtime:room:\(roomId):webrtc"

        var envelope: [String: Any] = [
            "from": localPeerId,
            "to": peerId,
            "sentAt": ISO8601DateFormatter().string(from: Date()),
            "displayName": displayName,
            "role": "tutor",
            "kind": kind
        ]

        if let description { envelope["description"] = description }
        if let candidate { envelope["candidate"] = candidate }

        let broadcastPayload: [String: Any] = [
            "type": "broadcast",
            "event": "webrtc_signal",
            "payload": envelope
        ]

        channelRef += 1
        sendWSMessage(topic: topic, event: "broadcast", payload: broadcastPayload, ref: "\(channelRef)")
    }

    // MARK: - SDP Negotiation

    fileprivate func createAndSendOffer(to peerId: String) {
        guard let peerConnection, !makingOffer else { return }
        makingOffer = true

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": "true"
            ],
            optionalConstraints: nil
        )

        peerConnection.offer(for: constraints) { [weak self] sdp, error in
            Task { @MainActor in
                guard let self, let sdp, error == nil else {
                    self?.makingOffer = false
                    return
                }
                self.peerConnection?.setLocalDescription(sdp) { setError in
                    Task { @MainActor in
                        if setError == nil {
                            self.sendSignal(
                                kind: "description",
                                to: peerId,
                                description: ["type": sdp.type.stringValue, "sdp": sdp.sdp]
                            )
                        }
                        self.makingOffer = false
                    }
                }
            }
        }
    }

    private func handleRemoteDescription(_ descDict: [String: Any], from peerId: String) {
        guard let peerConnection else { return }
        guard let typeStr = descDict["type"] as? String,
              let sdpStr = descDict["sdp"] as? String else { return }

        let type = RTCSessionDescription.type(for: typeStr)
        let remoteSdp = RTCSessionDescription(type: type, sdp: sdpStr)

        // Perfect negotiation: handle offer collision
        let offerCollision = type == .offer && (makingOffer || peerConnection.signalingState != .stable)
        if !isPolite && offerCollision {
            print("[WebRTCService] Ignoring colliding offer (impolite)")
            return
        }

        peerConnection.setRemoteDescription(remoteSdp) { [weak self] error in
            Task { @MainActor in
                guard let self, error == nil else { return }

                if type == .offer {
                    // Create and send answer
                    let answerConstraints = RTCMediaConstraints(
                        mandatoryConstraints: [
                            "OfferToReceiveAudio": "true",
                            "OfferToReceiveVideo": "true"
                        ],
                        optionalConstraints: nil
                    )

                    self.peerConnection?.answer(for: answerConstraints) { answer, answerError in
                        Task { @MainActor in
                            guard let answer, answerError == nil else { return }
                            self.peerConnection?.setLocalDescription(answer) { setError in
                                Task { @MainActor in
                                    if setError == nil {
                                        self.sendSignal(
                                            kind: "description",
                                            to: peerId,
                                            description: ["type": answer.type.stringValue, "sdp": answer.sdp]
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func handleRemoteCandidate(_ candidateDict: [String: Any]) {
        guard let sdp = candidateDict["candidate"] as? String,
              let sdpMLineIndex = candidateDict["sdpMLineIndex"] as? Int32 else { return }
        let sdpMid = candidateDict["sdpMid"] as? String

        let candidate = RTCIceCandidate(sdp: sdp, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
        peerConnection?.add(candidate) { error in
            if let error {
                print("[WebRTCService] Failed to add ICE candidate: \(error)")
            }
        }
    }

    // MARK: - WebSocket Communication

    private func sendWSMessage(topic: String, event: String, payload: [String: Any], ref: String?) {
        let message: [String: Any] = [
            "topic": topic,
            "event": event,
            "payload": payload,
            "ref": ref ?? NSNull()
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let string = String(data: data, encoding: .utf8) else { return }

        webSocketTask?.send(.string(string)) { error in
            if let error {
                print("[WebRTCService] Send error: \(error.localizedDescription)")
            }
        }
    }

    private func receiveMessages() {
        webSocketTask?.receive { [weak self] result in
            Task { @MainActor in
                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self?.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self?.handleMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    self?.receiveMessages()

                case .failure(let error):
                    print("[WebRTCService] Receive error: \(error.localizedDescription)")
                    if self?.connectionState != .idle {
                        self?.connectionState = .disconnected
                    }
                }
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[WebRTCService] Failed to parse WS message")
            return
        }

        let event = json["event"] as? String ?? ""
        let payload = json["payload"] as? [String: Any] ?? [:]

        // Log every non-heartbeat message for debugging
        if event != "phx_reply" || (payload["status"] as? String) != nil {
            let topic = json["topic"] as? String ?? ""
            print("[WebRTCService] WS event=\(event) topic=\(topic) payloadKeys=\(payload.keys.sorted())")
        }

        let refValue: String? = {
            if let s = json["ref"] as? String { return s }
            if let n = json["ref"] as? Int { return "\(n)" }
            return nil
        }()

        switch event {
        case "phx_reply":
            if let ref = refValue, ref == joinRef {
                let status = payload["status"] as? String
                print("[WebRTCService] Join reply: \(status ?? "unknown")")
                if status == "ok" {
                    isJoined = true
                    connectionState = .waitingForStudent
                    trackPresence()
                } else {
                    connectionState = .disconnected
                }
            }

        case "presence_state":
            handlePresenceState(payload)

        case "presence_diff":
            handlePresenceDiff(payload)

        case "broadcast":
            handleBroadcast(payload)

        case "phx_error":
            print("[WebRTCService] Channel error: \(payload)")
            connectionState = .disconnected

        case "phx_close":
            connectionState = .disconnected

        default:
            break
        }
    }

    // MARK: - Presence Handling

    private func handlePresenceState(_ payload: [String: Any]) {
        print("[WebRTCService] presence_state keys: \(payload.keys.sorted())")
        for (key, value) in payload {
            print("[WebRTCService]   presence key=\(key) valueType=\(type(of: value))")
            if let metas = value as? [String: Any],
               let metaList = metas["metas"] as? [[String: Any]] {
                for meta in metaList {
                    if let role = meta["role"] as? String, role == "student" {
                        let peerId = meta["peerId"] as? String
                        studentPresent = true
                        studentDisplayName = meta["displayName"] as? String
                        connectionState = .studentConnected
                        if let peerId {
                            onStudentJoined(peerId: peerId)
                        }
                        return
                    }
                }
            }
        }
    }

    private func handlePresenceDiff(_ payload: [String: Any]) {
        print("[WebRTCService] presence_diff joins=\(payload["joins"] != nil) leaves=\(payload["leaves"] != nil)")
        if let joins = payload["joins"] as? [String: Any] {
            print("[WebRTCService]   joins keys: \(joins.keys.sorted())")
            for (key, value) in joins {
                print("[WebRTCService]   join key=\(key) valueType=\(type(of: value))")
                if let metas = value as? [String: Any],
                   let metaList = metas["metas"] as? [[String: Any]] {
                    for meta in metaList {
                        if let role = meta["role"] as? String, role == "student" {
                            let peerId = meta["peerId"] as? String
                            studentPresent = true
                            studentDisplayName = meta["displayName"] as? String
                            connectionState = .studentConnected
                            if let peerId {
                                onStudentJoined(peerId: peerId)
                            }
                        }
                    }
                }
            }
        }

        if let leaves = payload["leaves"] as? [String: Any] {
            for (_, value) in leaves {
                if let metas = value as? [String: Any],
                   let metaList = metas["metas"] as? [[String: Any]] {
                    for meta in metaList {
                        if let role = meta["role"] as? String, role == "student" {
                            studentPresent = false
                            studentDisplayName = nil
                            remotePeerId = nil
                            remoteVideoTrack = nil
                            if connectionState == .studentConnected {
                                connectionState = .waitingForStudent
                            }
                        }
                    }
                }
            }
        }
    }

    private func onStudentJoined(peerId: String) {
        remotePeerId = peerId
        // Determine politeness: higher UUID is polite
        isPolite = localPeerId.compare(peerId) == .orderedDescending
        print("[WebRTCService] Student joined: \(peerId), I am \(isPolite ? "polite" : "impolite")")

        // If impolite, we create the offer
        if !isPolite {
            createAndSendOffer(to: peerId)
        }
    }

    // MARK: - Broadcast Handling

    private func handleBroadcast(_ payload: [String: Any]) {
        print("[WebRTCService] broadcast payloadKeys=\(payload.keys.sorted())")
        guard let envelope = payload["payload"] as? [String: Any] else {
            print("[WebRTCService]   broadcast: no nested payload found")
            return
        }
        let kind = envelope["kind"] as? String ?? ""
        let from = envelope["from"] as? String ?? ""
        print("[WebRTCService]   broadcast kind=\(kind) from=\(from.prefix(8))")

        guard from != localPeerId else { return }

        // Auto-set remote peer if not set
        if remotePeerId == nil {
            remotePeerId = from
            isPolite = localPeerId.compare(from) == .orderedDescending
        }

        switch kind {
        case "description":
            if let descDict = envelope["description"] as? [String: Any] {
                print("[WebRTCService] Received SDP \(descDict["type"] ?? "?") from \(from)")
                handleRemoteDescription(descDict, from: from)
            }

        case "ice_candidate":
            if let candidateDict = envelope["candidate"] as? [String: Any] {
                handleRemoteCandidate(candidateDict)
            }

        case "hangup":
            studentPresent = false
            studentDisplayName = nil
            remotePeerId = nil
            remoteVideoTrack = nil
            connectionState = .waitingForStudent

        default:
            break
        }
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.sendHeartbeat()
            }
        }
    }

    private func sendHeartbeat() {
        channelRef += 1
        sendWSMessage(topic: "phoenix", event: "heartbeat", payload: [:], ref: "\(channelRef)")
    }

    // MARK: - Delegate Callbacks (called from proxy)

    fileprivate func didGenerateCandidate(_ candidate: RTCIceCandidate) {
        guard let remotePeerId else { return }
        sendSignal(
            kind: "ice_candidate",
            to: remotePeerId,
            candidate: [
                "candidate": candidate.sdp,
                "sdpMLineIndex": candidate.sdpMLineIndex,
                "sdpMid": candidate.sdpMid ?? ""
            ]
        )
    }

    fileprivate func didAddRemoteTrack(_ track: RTCMediaStreamTrack) {
        if let videoTrack = track as? RTCVideoTrack {
            print("[WebRTCService] Remote video track received")
            remoteVideoTrack = videoTrack
        }
    }

    fileprivate func peerConnectionStateChanged(_ state: RTCPeerConnectionState) {
        print("[WebRTCService] Peer connection state: \(state.rawValue)")
        switch state {
        case .connected:
            connectionState = .studentConnected
            // Check transceivers for remote video track if not already set
            if remoteVideoTrack == nil {
                checkTransceiversForRemoteVideo()
            }
        case .disconnected, .failed:
            remoteVideoTrack = nil
            if studentPresent {
                connectionState = .studentConnected // still in presence
            }
        default:
            break
        }
    }

    private func checkTransceiversForRemoteVideo() {
        guard let peerConnection else { return }
        for transceiver in peerConnection.transceivers {
            if transceiver.mediaType == .video,
               let track = transceiver.receiver.track as? RTCVideoTrack {
                print("[WebRTCService] Found remote video track via transceiver")
                remoteVideoTrack = track
                return
            }
        }
    }
}

// MARK: - RTCPeerConnectionDelegate Proxy (non-MainActor)

private class WebRTCDelegateProxy: NSObject, RTCPeerConnectionDelegate {
    weak var service: WebRTCService?

    init(service: WebRTCService) {
        self.service = service
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        for track in stream.videoTracks {
            Task { @MainActor in
                self.service?.didAddRemoteTrack(track)
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd receiver: RTCRtpReceiver, streams: [RTCMediaStream]) {
        let track = receiver.track
        Task { @MainActor in
            if let track {
                self.service?.didAddRemoteTrack(track)
            }
        }
    }

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        // Negotiation needed — the polite/impolite side handles offer creation
        Task { @MainActor in
            guard let service = self.service, let remotePeerId = service.remotePeerId else { return }
            if !service.isPolite {
                service.createAndSendOffer(to: remotePeerId)
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        Task { @MainActor in
            self.service?.didGenerateCandidate(candidate)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCPeerConnectionState) {
        Task { @MainActor in
            self.service?.peerConnectionStateChanged(stateChanged)
        }
    }
}

// MARK: - RTCSessionDescription helpers

private extension RTCSdpType {
    var stringValue: String {
        switch self {
        case .offer: return "offer"
        case .prAnswer: return "pranswer"
        case .answer: return "answer"
        case .rollback: return "rollback"
        @unknown default: return "unknown"
        }
    }
}

// MARK: - Mock WebRTC Service (for tests)

@MainActor
final class MockWebRTCService: WebRTCServiceProtocol {
    var connectionState: WebRTCConnectionState = .idle
    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> {
        Just(.idle).eraseToAnyPublisher()
    }
    var studentPresent = false
    var studentDisplayName: String?
    var remoteVideoTrack: RTCVideoTrack?
    var localVideoTrack: RTCVideoTrack?

    func connect(roomId: String, displayName: String, accessToken: String?) async {
        connectionState = .waitingForStudent
    }

    func disconnect() {
        connectionState = .idle
    }
}
