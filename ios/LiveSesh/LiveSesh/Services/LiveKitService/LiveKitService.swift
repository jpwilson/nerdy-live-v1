import Foundation
import AVFoundation
import Combine
#if canImport(LiveKit)
import LiveKit
#endif

// MARK: - LiveKit Service

#if canImport(LiveKit)
@MainActor
final class LiveKitService: NSObject, ObservableObject {
    @Published private(set) var connectionState: WebRTCConnectionState = .idle
    @Published private(set) var studentPresent = false
    @Published private(set) var studentDisplayName: String?
    @Published private(set) var remotePeerPresent = false
    @Published private(set) var remotePeerDisplayName: String?
    @Published private(set) var remoteVideoTrack: VideoTrack?
    @Published private(set) var localVideoTrack: VideoTrack?
    @Published var isMicrophoneEnabled = true
    @Published var isCameraEnabled = true
    @Published var cameraPosition: AVCaptureDevice.Position = .front

    var connectionStatePublisher: AnyPublisher<WebRTCConnectionState, Never> {
        $connectionState.eraseToAnyPublisher()
    }

    private var room: Room?
    private var localRole: String = "tutor"
    private var localPeerId = UUID().uuidString

    // MARK: - Public API

    func connect(roomId: String, displayName: String, accessToken: String?, role: String = "tutor") async {
        guard connectionState == .idle || connectionState == .disconnected else { return }

        self.localRole = role
        connectionState = .connecting

        // Configure audio session
        configureAudioSession()

        // Fetch token from server
        guard let token = await fetchToken(roomName: roomId, participantName: displayName, role: role) else {
            connectionState = .disconnected
            return
        }

        let room = Room(delegate: self)
        self.room = room

        do {
            try await room.connect(url: LiveKitConfig.url, token: token)

            // Enable camera (front-facing) and microphone
            try await room.localParticipant.setCamera(enabled: true, captureOptions: CameraCaptureOptions(position: .front))
            try await room.localParticipant.setMicrophone(enabled: true)

            // Grab local video track
            if let pub = room.localParticipant.localVideoTracks.first,
               let track = pub.track as? VideoTrack {
                localVideoTrack = track
            }

            // Check for existing remote participants
            updateRemoteState()

            if remotePeerPresent {
                connectionState = .studentConnected
            } else {
                connectionState = .waitingForStudent
            }
        } catch {
            print("[LiveKitService] Connection failed: \(error)")
            connectionState = .disconnected
        }
    }

    func toggleMicrophone() {
        let next = !isMicrophoneEnabled
        isMicrophoneEnabled = next
        Task {
            try? await room?.localParticipant.setMicrophone(enabled: next)
        }
    }

    func toggleCamera() {
        let next = !isCameraEnabled
        isCameraEnabled = next
        Task {
            try? await room?.localParticipant.setCamera(enabled: next, captureOptions: CameraCaptureOptions(position: cameraPosition))
            if next {
                if let pub = room?.localParticipant.localVideoTracks.first,
                   let track = pub.track as? VideoTrack {
                    localVideoTrack = track
                }
            }
        }
    }

    func switchCamera() {
        let next: AVCaptureDevice.Position = cameraPosition == .front ? .back : .front
        cameraPosition = next
        Task {
            try? await room?.localParticipant.setCamera(enabled: true, captureOptions: CameraCaptureOptions(position: next))
            if let pub = room?.localParticipant.localVideoTracks.first,
               let track = pub.track as? VideoTrack {
                localVideoTrack = track
            }
        }
    }

    func disconnect() {
        Task {
            await room?.disconnect()
        }
        room = nil
        remoteVideoTrack = nil
        localVideoTrack = nil
        studentPresent = false
        studentDisplayName = nil
        remotePeerPresent = false
        remotePeerDisplayName = nil
        connectionState = .idle
    }

    // MARK: - Private

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[LiveKitService] Audio session config failed: \(error.localizedDescription)")
        }
    }

    private func fetchToken(roomName: String, participantName: String, role: String) async -> String? {
        guard let url = URL(string: LiveKitConfig.tokenEndpoint) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "roomName": roomName,
            "participantName": participantName,
            "participantIdentity": "\(role)-\(localPeerId)"
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        request.httpBody = bodyData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                print("[LiveKitService] Token request failed: \(response)")
                return nil
            }

            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let token = json["token"] as? String {
                return token
            }
        } catch {
            print("[LiveKitService] Token fetch error: \(error)")
        }

        return nil
    }

    private func updateRemoteState() {
        guard let room else { return }

        if let remote = room.remoteParticipants.values.first {
            remotePeerPresent = true
            remotePeerDisplayName = remote.name ?? remote.identity?.stringValue
            studentPresent = true
            studentDisplayName = remotePeerDisplayName

            // Find remote video track
            for pub in remote.videoTracks {
                if let track = pub.track as? VideoTrack {
                    remoteVideoTrack = track
                    break
                }
            }
        } else {
            remotePeerPresent = false
            remotePeerDisplayName = nil
            studentPresent = false
            studentDisplayName = nil
            remoteVideoTrack = nil
        }
    }
}

// MARK: - RoomDelegate

extension LiveKitService: RoomDelegate {
    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        Task { @MainActor in
            switch connectionState {
            case .connected:
                self.updateRemoteState()
                self.connectionState = self.remotePeerPresent ? .studentConnected : .waitingForStudent
            case .reconnecting:
                // Keep current state during reconnection
                break
            case .disconnected:
                self.connectionState = .disconnected
            default:
                break
            }
        }
    }

    nonisolated func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remotePeerPresent = true
            self.remotePeerDisplayName = participant.name ?? participant.identity?.stringValue
            self.studentPresent = true
            self.studentDisplayName = self.remotePeerDisplayName
            self.connectionState = .studentConnected
        }
    }

    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remotePeerPresent = false
            self.remotePeerDisplayName = nil
            self.studentPresent = false
            self.studentDisplayName = nil
            self.remoteVideoTrack = nil
            self.connectionState = .waitingForStudent
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        Task { @MainActor in
            if let track = publication.track as? VideoTrack {
                self.remoteVideoTrack = track
            }
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        Task { @MainActor in
            if publication.track is VideoTrack {
                // Check if there are other video tracks
                self.updateRemoteState()
            }
        }
    }
}
#endif
