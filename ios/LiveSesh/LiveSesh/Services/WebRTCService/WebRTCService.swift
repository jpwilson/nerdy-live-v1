import Foundation
import Combine

// MARK: - WebRTC Service Protocol

@MainActor
protocol WebRTCServiceProtocol: AnyObject {
    var connectionState: WebRTCConnectionState { get }
    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> { get }
    var studentPresent: Bool { get }
    var studentDisplayName: String? { get }

    func connect(roomId: String, displayName: String, accessToken: String?) async
    func disconnect()
}

// MARK: - Supabase Realtime Signaling Service

/// WebRTCService connects to a Supabase Realtime channel for WebRTC signaling and presence.
///
/// In the current implementation, this service handles:
/// - Connecting to the `room:{roomId}:webrtc` channel via WebSocket
/// - Tracking presence (detecting when a student joins/leaves)
/// - Publishing connection state changes
///
/// The actual RTCPeerConnection for media exchange requires the WebRTC.framework binary.
/// When that is added, extend this service to create/manage the peer connection, handle
/// SDP offer/answer exchange, and ICE candidate trickle through the signaling channel.
///
/// For the demo, the front camera is used for analysis and metrics can be labeled as
/// student metrics (simulating what would happen with a real WebRTC incoming stream).
@MainActor
final class WebRTCService: ObservableObject, WebRTCServiceProtocol {
    @Published private(set) var connectionState: WebRTCConnectionState = .idle
    @Published private(set) var studentPresent = false
    @Published private(set) var studentDisplayName: String?

    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> {
        $connectionState.eraseToAnyPublisher()
    }

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

    init(supabaseURL: String? = nil, supabaseAnonKey: String? = nil) {
        self.supabaseURL = supabaseURL ?? SupabaseConfig.url
        self.supabaseAnonKey = supabaseAnonKey ?? SupabaseConfig.anonKey
    }

    // MARK: - Public API

    func connect(roomId: String, displayName: String, accessToken: String?) async {
        guard connectionState == .idle || connectionState == .disconnected else { return }

        self.roomId = roomId
        self.displayName = displayName
        connectionState = .connecting

        // Build WebSocket URL for Supabase Realtime
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

        // Start receiving messages
        receiveMessages()

        // Join the channel after a small delay for the connection to establish
        try? await Task.sleep(nanoseconds: 500_000_000)

        joinChannel()
        startHeartbeat()
    }

    func disconnect() {
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

    // MARK: - Channel Management

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

        sendMessage(
            topic: topic,
            event: "phx_join",
            payload: joinPayload,
            ref: joinRef
        )
    }

    private func leaveChannel() {
        guard let roomId, isJoined else { return }
        let topic = "realtime:room:\(roomId):webrtc"
        channelRef += 1
        sendMessage(
            topic: topic,
            event: "phx_leave",
            payload: [:],
            ref: "\(channelRef)"
        )
    }

    /// Track presence by broadcasting tutor state.
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
        sendMessage(topic: topic, event: "presence", payload: presencePayload, ref: "\(channelRef)")
    }

    // MARK: - Signaling (stub for real WebRTC)

    /// Send a WebRTC signal envelope via Supabase Realtime broadcast.
    /// This is used when an RTCPeerConnection is integrated.
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

        if let description {
            envelope["description"] = description
        }
        if let candidate {
            envelope["candidate"] = candidate
        }

        let broadcastPayload: [String: Any] = [
            "type": "broadcast",
            "event": "webrtc_signal",
            "payload": envelope
        ]

        channelRef += 1
        sendMessage(topic: topic, event: "broadcast", payload: broadcastPayload, ref: "\(channelRef)")
    }

    // MARK: - WebSocket Communication

    private func sendMessage(topic: String, event: String, payload: [String: Any], ref: String?) {
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
                    // Continue receiving
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
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        let event = json["event"] as? String ?? ""
        let topic = json["topic"] as? String ?? ""
        let payload = json["payload"] as? [String: Any] ?? [:]

        switch event {
        case "phx_reply":
            // Check for join reply
            if let ref = json["ref"] as? String, ref == joinRef {
                let status = payload["status"] as? String
                if status == "ok" {
                    isJoined = true
                    connectionState = .waitingForStudent
                    trackPresence()
                } else {
                    connectionState = .disconnected
                }
            }

        case "presence_state":
            // Initial presence state - check for existing students
            handlePresenceState(payload)

        case "presence_diff":
            // Presence changes
            handlePresenceDiff(payload)

        case "broadcast":
            // WebRTC signaling messages
            handleBroadcast(payload)

        case "phx_error":
            connectionState = .disconnected

        case "phx_close":
            connectionState = .disconnected

        default:
            break
        }
    }

    private func handlePresenceState(_ payload: [String: Any]) {
        // Check all present peers for a student role
        for (_, value) in payload {
            if let metas = value as? [String: Any],
               let metaList = metas["metas"] as? [[String: Any]] {
                for meta in metaList {
                    if let role = meta["role"] as? String, role == "student" {
                        studentPresent = true
                        studentDisplayName = meta["displayName"] as? String
                        connectionState = .studentConnected
                        return
                    }
                }
            }
        }
    }

    private func handlePresenceDiff(_ payload: [String: Any]) {
        // Check joins
        if let joins = payload["joins"] as? [String: Any] {
            for (_, value) in joins {
                if let metas = value as? [String: Any],
                   let metaList = metas["metas"] as? [[String: Any]] {
                    for meta in metaList {
                        if let role = meta["role"] as? String, role == "student" {
                            studentPresent = true
                            studentDisplayName = meta["displayName"] as? String
                            connectionState = .studentConnected
                        }
                    }
                }
            }
        }

        // Check leaves
        if let leaves = payload["leaves"] as? [String: Any] {
            for (_, value) in leaves {
                if let metas = value as? [String: Any],
                   let metaList = metas["metas"] as? [[String: Any]] {
                    for meta in metaList {
                        if let role = meta["role"] as? String, role == "student" {
                            studentPresent = false
                            studentDisplayName = nil
                            if connectionState == .studentConnected {
                                connectionState = .waitingForStudent
                            }
                        }
                    }
                }
            }
        }
    }

    private func handleBroadcast(_ payload: [String: Any]) {
        guard let envelope = payload["payload"] as? [String: Any] else { return }
        let kind = envelope["kind"] as? String ?? ""
        let from = envelope["from"] as? String ?? ""

        // Skip messages from self
        guard from != localPeerId else { return }

        switch kind {
        case "description":
            // TODO: When WebRTC.framework is integrated, handle SDP offer/answer here.
            // Use perfect negotiation pattern:
            // - Compare UUIDs to determine polite (higher UUID) vs impolite (lower UUID)
            // - Polite peer rolls back on collision, impolite peer ignores incoming offer
            print("[WebRTCService] Received SDP description from \(from) - WebRTC.framework required for media exchange")

        case "ice_candidate":
            // TODO: When WebRTC.framework is integrated, add ICE candidate to peer connection
            print("[WebRTCService] Received ICE candidate from \(from) - WebRTC.framework required for media exchange")

        case "hangup":
            studentPresent = false
            studentDisplayName = nil
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
        sendMessage(
            topic: "phoenix",
            event: "heartbeat",
            payload: [:],
            ref: "\(channelRef)"
        )
    }
}

// MARK: - Mock WebRTC Service (for tests)

final class MockWebRTCService: WebRTCServiceProtocol {
    var connectionState: WebRTCConnectionState = .idle
    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> {
        Just(.idle).eraseToAnyPublisher()
    }
    var studentPresent = false
    var studentDisplayName: String?

    func connect(roomId: String, displayName: String, accessToken: String?) async {
        connectionState = .waitingForStudent
    }

    func disconnect() {
        connectionState = .idle
    }
}
