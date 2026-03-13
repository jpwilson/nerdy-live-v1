import SwiftUI
#if canImport(WebRTC)
import WebRTC
#endif

struct StudentRoomView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = StudentSessionViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                switch viewModel.sessionState {
                case .idle:
                    joinRoomView
                case .checkingRoom:
                    statusView(
                        icon: "magnifyingglass",
                        message: "Checking room...",
                        detail: "Room: \(viewModel.roomCode)"
                    )
                case .waitingForTutor:
                    statusView(
                        icon: "person.fill.questionmark",
                        message: "Waiting for tutor...",
                        detail: "The tutor hasn't started the session yet. You'll connect automatically when they join."
                    )
                case .inCall:
                    inCallView
                case .disconnected:
                    disconnectedView
                }
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .principal) {
                    if viewModel.sessionState != .inCall {
                        NerdyLogo()
                    }
                }
            }
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .navigationBarHidden(viewModel.sessionState == .inCall)
            #endif
        }
    }

    // MARK: - Join Room

    private var joinRoomView: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "video.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(NerdyTheme.gradientAccent)

                Text("Join a Session")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                Text("Enter the room code from your tutor")
                    .font(.subheadline)
                    .foregroundColor(NerdyTheme.textSecondary)
            }

            NerdyCard {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Room Code")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        TextField("e.g., demo-room", text: $viewModel.roomCode)
                            .textFieldStyle(NerdyTextFieldStyle())
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif

                        if viewModel.roomCode.isEmpty || viewModel.roomCode != "demo-room" {
                            Button {
                                viewModel.roomCode = "demo-room"
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "play.circle.fill")
                                        .font(.caption2)
                                    Text("demo-room")
                                        .font(.caption)
                                        .fontWeight(.semibold)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule()
                                        .fill(NerdyTheme.cyan.opacity(0.15))
                                        .overlay(
                                            Capsule().stroke(NerdyTheme.cyan.opacity(0.3), lineWidth: 1)
                                        )
                                )
                                .foregroundColor(NerdyTheme.cyan)
                            }
                        }
                    }

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }

                    NerdyButton("Join Room", icon: "arrow.right.circle.fill") {
                        Task {
                            await viewModel.joinRoom(accessToken: appState.currentAccessToken)
                        }
                    }
                }
            }
            .padding(.horizontal)

            Spacer()

            // Sign out button
            Button {
                appState.authService.signOut()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Sign Out")
                }
                .font(.subheadline)
                .foregroundColor(NerdyTheme.textSecondary)
            }
            .padding(.bottom, 8)

            Spacer()
        }
    }

    // MARK: - Status View

    private func statusView(icon: String, message: String, detail: String) -> some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                ProgressView()
                    .tint(NerdyTheme.cyan)
                    .scaleEffect(1.2)

                Image(systemName: icon)
                    .font(.system(size: 40))
                    .foregroundColor(NerdyTheme.cyan)

                Text(message)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)

                Text(detail)
                    .font(.caption)
                    .foregroundColor(NerdyTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Button {
                viewModel.leaveRoom()
            } label: {
                Text("Cancel")
                    .font(.subheadline)
                    .foregroundColor(NerdyTheme.textSecondary)
            }

            Spacer()
        }
    }

    // MARK: - In Call View

    private var inCallView: some View {
        ZStack {
            // Full-screen tutor video (remote) — biased toward bottom to center face
            #if os(iOS) && canImport(WebRTC)
            if let remoteTrack = viewModel.webRTCService.remoteVideoTrack {
                Color.black.ignoresSafeArea()
                GeometryReader { geo in
                    RTCVideoViewRepresentable(videoTrack: remoteTrack, fill: true)
                        .frame(height: geo.size.height * 1.25)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
                .clipped()
                .ignoresSafeArea()
            } else {
                NerdyTheme.backgroundGradient.ignoresSafeArea()
                VStack(spacing: 16) {
                    ProgressView().tint(NerdyTheme.cyan)
                    Text("Connecting video...")
                        .font(.headline)
                        .foregroundColor(NerdyTheme.textSecondary)
                }
            }
            #endif

            // Gradient overlays
            VStack(spacing: 0) {
                LinearGradient(
                    colors: [Color.black.opacity(0.5), .clear],
                    startPoint: .top, endPoint: .bottom
                ).frame(height: 80)
                Spacer()
                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.65)],
                    startPoint: .top, endPoint: .bottom
                ).frame(height: 140)
            }
            .ignoresSafeArea()

            // Overlays
            VStack {
                // Top bar
                HStack {
                    if let name = viewModel.tutorDisplayName {
                        HStack(spacing: 6) {
                            Circle().fill(NerdyTheme.cyan).frame(width: 8, height: 8)
                            Text(name)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.black.opacity(0.4)))
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                Spacer()

                // Bottom: leave button only (no metrics for students)
                HStack {
                    Spacer()

                    // Leave button
                    Button(action: { viewModel.leaveRoom() }) {
                        Image(systemName: "phone.down.fill")
                            .font(.title3)
                            .foregroundColor(.white)
                            .frame(width: 56, height: 56)
                            .background(Circle().fill(Color.red))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }

            // PiP: Student's own camera (top-right)
            #if os(iOS) && canImport(WebRTC)
            VStack {
                HStack {
                    Spacer()
                    if let localTrack = viewModel.webRTCService.localVideoTrack {
                        RTCVideoViewRepresentable(videoTrack: localTrack, fill: true, mirrored: true)
                            .frame(width: 90, height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
                            )
                            .shadow(color: .black.opacity(0.5), radius: 6, x: 0, y: 3)
                            .padding(.top, 8)
                            .padding(.trailing, 12)
                    }
                }
                Spacer()
            }
            #endif
        }
    }

    // MARK: - Disconnected

    private var disconnectedView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "phone.down.circle.fill")
                .font(.system(size: 56))
                .foregroundColor(NerdyTheme.textMuted)

            Text("Session Ended")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(.white)

            Text("The tutor has ended the session or the connection was lost.")
                .font(.caption)
                .foregroundColor(NerdyTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            NerdyButton("Back to Room", icon: "arrow.left") {
                viewModel.leaveRoom()
            }

            Spacer()
        }
    }
}
