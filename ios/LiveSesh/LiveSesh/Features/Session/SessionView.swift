import SwiftUI
import AVFoundation
#if canImport(WebRTC)
import WebRTC
#endif
#if os(iOS)
import UIKit
#endif

struct SessionView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: SessionViewModel

    init(authenticatedTutorId: UUID? = nil, supabaseService: SupabaseServiceProtocol? = nil) {
        _viewModel = StateObject(wrappedValue: SessionViewModel(
            supabaseService: supabaseService,
            authenticatedTutorId: authenticatedTutorId
        ))
    }

    private var isTestMode: Bool {
        appState.testModeEnabled
    }

    private var roomCode: String {
        appState.roomCode
    }

    private var showOverlays: Bool {
        appState.showAnalysisOverlays
    }

    /// Whether the nav bar should be hidden (live call mode = fullscreen video)
    private var hideChromeForCall: Bool {
        viewModel.isSessionActive && !isTestMode
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                if viewModel.isSessionActive {
                    activeSessionView
                } else {
                    startSessionView
                }
            }
            .navigationTitle("")
            #if os(iOS)
            .navigationBarHidden(hideChromeForCall)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    if !hideChromeForCall {
                        NerdyLogo()
                    }
                }
                #if os(iOS)
                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.isSessionActive && !hideChromeForCall {
                        overlayToggleButton
                    }
                }
                #endif
            }
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
        }
        .overlay(alignment: .topTrailing) {
            nudgeOverlay
        }
    }

    private var overlayToggleButton: some View {
        Button {
            appState.showAnalysisOverlays.toggle()
        } label: {
            Image(systemName: showOverlays ? "eye.fill" : "eye.slash.fill")
                .foregroundColor(showOverlays ? NerdyTheme.cyan : NerdyTheme.textMuted)
        }
    }

    // MARK: - Start Session View

    private var startSessionView: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("Live")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(NerdyTheme.gradientLiveAI)
                + Text("+AI")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(.white)

                Text("Session Analysis")
                    .font(.title3)
                    .foregroundColor(NerdyTheme.textSecondary)
            }

            NerdyCard {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Session Setup")
                        .font(.headline)
                        .foregroundColor(.white)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Subject")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        TextField("e.g., Algebra, Biology", text: $viewModel.subject)
                            .textFieldStyle(NerdyTextFieldStyle())
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Student Level")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        Picker("Level", selection: $viewModel.studentLevel) {
                            ForEach(StudentLevel.allCases, id: \.self) { level in
                                Text(level.rawValue).tag(level)
                            }
                        }
                        .pickerStyle(.segmented)
                        .colorMultiply(NerdyTheme.cyan)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Coaching Sensitivity")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        Picker("Sensitivity", selection: $viewModel.coachingSensitivity) {
                            ForEach(CoachingSensitivity.allCases, id: \.self) { level in
                                Text(level.rawValue).tag(level)
                            }
                        }
                        .pickerStyle(.segmented)
                        .colorMultiply(NerdyTheme.cyan)
                    }
                }
            }
            .padding(.horizontal)

            // Mode indicator
            if isTestMode {
                testModeBanner
                    .padding(.horizontal)
            } else if !roomCode.isEmpty {
                roomCodeBanner
                    .padding(.horizontal)
            }

            NerdyButton("Start Session", icon: "video.fill") {
                viewModel.startSession(
                    testModeEnabled: isTestMode,
                    roomCode: roomCode,
                    accessToken: appState.currentAccessToken
                )
            }

            if let syncStatusMessage {
                SessionStatusBanner(
                    message: syncStatusMessage,
                    symbol: "icloud.fill",
                    accentColor: syncStatusAccentColor
                )
                .padding(.horizontal)
            }

            Spacer()

            // Sign out button on session start page
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
        }
    }

    // MARK: - Active Session View

    private var activeSessionView: some View {
        Group {
            if isTestMode {
                testModeActiveSessionView
            } else {
                liveCallActiveSessionView
            }
        }
    }

    // MARK: - Test Mode Layout (scrollable cards, no WebRTC)

    private var testModeActiveSessionView: some View {
        ScrollView {
            VStack(spacing: 12) {
                activeTestModePill
                    .padding(.horizontal)

                ZStack {
                    LiveCaptureSurfaceView(
                        controller: viewModel.liveCaptureController,
                        sessionDuration: viewModel.sessionDuration,
                        captureStatusMessage: captureStatusMessage,
                        syncStatusMessage: syncStatusMessage,
                        syncStatusAccentColor: syncStatusAccentColor,
                        showCameraPreview: true
                    )

                    if showOverlays {
                        GeometryReader { geo in
                            FaceOverlayView(
                                faceDetection: viewModel.latestFaceDetection,
                                gaze: viewModel.latestGaze,
                                expression: viewModel.latestExpression,
                                viewSize: geo.size
                            )
                            FaceMeshOverlayView(
                                faceDetection: viewModel.latestFaceDetection,
                                viewSize: geo.size
                            )
                        }
                    }
                }
                .padding(.horizontal)

                LiveMetricsDashboardView(metrics: viewModel.currentMetrics)
                    .padding(.horizontal)

                SpeakingIndicatorView(
                    tutorSpeaking: viewModel.currentMetrics.tutor.isSpeaking,
                    studentSpeaking: viewModel.currentMetrics.student.isSpeaking
                )
                .padding(.horizontal)

                endSessionButton
            }
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Live Call Layout (FaceTime-style)

    private var liveCallActiveSessionView: some View {
        ZStack {
            // Full-screen student video (remote) — aspectFill to use all screen space
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
                // Waiting state — dark background with status
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()
                VStack(spacing: 16) {
                    ProgressView()
                        .tint(NerdyTheme.cyan)
                    Text(viewModel.webRTCConnectionState == .waitingForStudent
                         ? "Waiting for student to join..."
                         : viewModel.webRTCConnectionState == .studentConnected
                            ? "Connecting video..."
                            : "Connecting to room...")
                        .font(.headline)
                        .foregroundColor(NerdyTheme.textSecondary)
                    Text("Room: \(roomCode)")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textMuted)
                }
            }
            #endif

            // Gradient overlay for readability at top and bottom
            VStack(spacing: 0) {
                LinearGradient(
                    colors: [Color.black.opacity(0.5), Color.black.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 80)

                Spacer()

                LinearGradient(
                    colors: [Color.black.opacity(0), Color.black.opacity(0.65)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 160)
            }
            .ignoresSafeArea()

            // Overlays
            VStack {
                // Top bar: timer + connection status
                HStack {
                    // Live indicator + timer
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 8, height: 8)
                        Text(viewModel.sessionDuration)
                            .font(.system(size: 16, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.black.opacity(0.4)))

                    Spacer()

                    // Overlay toggle in live call
                    Button {
                        appState.showAnalysisOverlays.toggle()
                    } label: {
                        Image(systemName: showOverlays ? "eye.fill" : "eye.slash.fill")
                            .font(.caption)
                            .foregroundColor(showOverlays ? NerdyTheme.cyan : .white.opacity(0.6))
                            .padding(8)
                            .background(Circle().fill(Color.black.opacity(0.4)))
                    }

                    // Connection status
                    if let name = viewModel.studentDisplayName,
                       viewModel.webRTCConnectionState == .studentConnected {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(NerdyTheme.cyan)
                                .frame(width: 6, height: 6)
                            Text(name)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.black.opacity(0.4)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                Spacer()

                // Bottom: compact metrics + controls
                VStack(spacing: 12) {
                    // Compact metrics row
                    compactMetricsBar

                    // Speaking indicators + end call
                    HStack(spacing: 16) {
                        SpeakingIndicatorView(
                            tutorSpeaking: viewModel.currentMetrics.tutor.isSpeaking,
                            studentSpeaking: viewModel.currentMetrics.student.isSpeaking
                        )

                        Spacer()

                        // End call button (red circle like FaceTime)
                        Button(action: { viewModel.endSession() }) {
                            Image(systemName: "phone.down.fill")
                                .font(.title3)
                                .foregroundColor(.white)
                                .frame(width: 56, height: 56)
                                .background(Circle().fill(Color.red))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }

            // PiP: Tutor's own camera (top-right) — aspectFill for compact framing
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

    // MARK: - Compact Metrics Bar (for live call overlay)

    private var compactMetricsBar: some View {
        HStack(spacing: 16) {
            compactGauge(icon: "eye.fill", label: "Eye", value: effectiveEyeContact)
            compactGauge(icon: "bolt.fill", label: "Energy", value: effectiveEnergy)
            compactGauge(icon: "scale.3d", label: "Balance", value: effectiveTalkBalance)

            if viewModel.currentMetrics.session.silenceDurationCurrent > 10 {
                HStack(spacing: 4) {
                    Image(systemName: "speaker.slash.fill")
                        .font(.caption2)
                    Text("\(Int(viewModel.currentMetrics.session.silenceDurationCurrent))s")
                        .font(.caption2)
                        .fontWeight(.semibold)
                }
                .foregroundColor(NerdyTheme.nudgeSuggestion)
            }

            Spacer()

            TrendBadge(trend: viewModel.currentMetrics.session.engagementTrend)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(.ultraThinMaterial)
                .opacity(0.9)
        )
    }

    private func compactGauge(icon: String, label: String, value: Double) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundColor(gaugeColor(for: value))
            Text("\(Int(value * 100))%")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white)
        }
    }

    private func gaugeColor(for value: Double) -> Color {
        if value >= 0.6 { return NerdyTheme.cyan }
        if value >= 0.4 { return NerdyTheme.nudgeSuggestion }
        return NerdyTheme.nudgeAlert
    }

    private var effectiveEyeContact: Double {
        let m = viewModel.currentMetrics
        let hasStudent = m.student.eyeContactScore > 0
        return hasStudent ? (m.tutor.eyeContactScore + m.student.eyeContactScore) / 2 : m.tutor.eyeContactScore
    }

    private var effectiveEnergy: Double {
        let m = viewModel.currentMetrics
        let hasStudent = m.student.energyScore != 0.5
        return hasStudent ? (m.tutor.energyScore + m.student.energyScore) / 2 : m.tutor.energyScore
    }

    private var effectiveTalkBalance: Double {
        1.0 - abs(viewModel.currentMetrics.tutor.talkTimePercent - 0.5) * 2
    }

    private var endSessionButton: some View {
        Button(action: { viewModel.endSession() }) {
            HStack {
                Image(systemName: "stop.circle.fill")
                Text("End Session")
            }
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusLarge)
                    .fill(Color.red.opacity(0.8))
            )
        }
        .padding(.vertical, 8)
    }

    // MARK: - Nudge Overlay

    private var nudgeOverlay: some View {
        VStack(alignment: .trailing, spacing: 8) {
            ForEach(viewModel.activeNudges) { nudge in
                NudgePillView(nudge: nudge) {
                    viewModel.dismissNudge(nudge)
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
                .animation(.spring(response: 0.4), value: viewModel.activeNudges.count)
            }
        }
        .padding(.top, 100)
        .padding(.trailing, 16)
    }

    // MARK: - Mode & Connection Banners

    private var testModeBanner: some View {
        NerdyCard {
            HStack(spacing: 10) {
                Image(systemName: "testtube.2")
                    .foregroundColor(NerdyTheme.nudgeSuggestion)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Test Mode")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(NerdyTheme.nudgeSuggestion)
                    Text("Self-analysis mode. Camera feed is analyzed as if it were the student.")
                        .font(.caption2)
                        .foregroundColor(NerdyTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var roomCodeBanner: some View {
        NerdyCard {
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .foregroundColor(NerdyTheme.cyan)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Room: \(roomCode)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Text("Student can join from the web app with this room code.")
                        .font(.caption2)
                        .foregroundColor(NerdyTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var activeTestModePill: some View {
        HStack(spacing: 6) {
            Image(systemName: "testtube.2")
                .font(.caption2)
                .foregroundColor(NerdyTheme.nudgeSuggestion)
            Text("TEST MODE - Self Analysis")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(NerdyTheme.nudgeSuggestion)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(NerdyTheme.nudgeSuggestion.opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(NerdyTheme.nudgeSuggestion.opacity(0.3), lineWidth: 1)
                )
        )
    }

    private var activeConnectionPill: some View {
        let state = viewModel.webRTCConnectionState
        let color: Color = state == .studentConnected ? NerdyTheme.cyan : NerdyTheme.textSecondary
        let icon: String = state == .studentConnected ? "person.fill.checkmark" : "person.fill.questionmark"
        let label: String
        if let name = viewModel.studentDisplayName, state == .studentConnected {
            label = "\(name) connected"
        } else {
            label = state.displayLabel
        }

        return HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundColor(color)
            Text(label)
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(color)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(color.opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(color.opacity(0.3), lineWidth: 1)
                )
        )
    }

    private var captureStatusMessage: String? {
        if viewModel.currentPhase == "Simulator Demo Mode" {
            return "Simulator fallback is active. Run on an iPhone for real camera and microphone capture."
        }

        if viewModel.liveCaptureController.isRunning {
            if isTestMode {
                return "Test mode: your camera is analyzed as both tutor and student."
            }
            return "Camera is live. Tutor metrics are active. Student metrics require a student to join via the web app."
        }

        return viewModel.liveCaptureController.status.message ?? (viewModel.currentPhase.isEmpty ? nil : viewModel.currentPhase)
    }

    private var syncStatusMessage: String? {
        viewModel.syncStatus.isEmpty ? nil : viewModel.syncStatus
    }

    private var syncStatusAccentColor: Color {
        viewModel.syncStatus.localizedCaseInsensitiveContains("failed") ? Color.red : NerdyTheme.cyan
    }
}

// MARK: - Supporting Views

struct NerdyLogo: View {
    var body: some View {
        Text("nerdy")
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .foregroundStyle(NerdyTheme.gradientLiveAI)
    }
}

struct NerdyTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                    .fill(NerdyTheme.backgroundElevated)
            )
            .foregroundColor(.white)
    }
}

struct LiveMetricsDashboardView: View {
    let metrics: EngagementMetrics

    var body: some View {
        NerdyCard {
            VStack(spacing: 12) {
                HStack {
                    Text("Live Metrics")
                        .font(.headline)
                        .foregroundColor(.white)
                    Spacer()
                    TrendBadge(trend: metrics.session.engagementTrend)
                }

                HStack(spacing: 20) {
                    MetricGauge(
                        label: "Eye Contact",
                        value: effectiveEyeContact,
                        icon: "eye.fill"
                    )
                    MetricGauge(
                        label: "Energy",
                        value: effectiveEnergy,
                        icon: "bolt.fill"
                    )
                    MetricGauge(
                        label: hasStudentSignal ? "Balance" : "Tutor Talk",
                        value: hasStudentSignal ? talkBalance : metrics.tutor.talkTimePercent,
                        icon: "scale.3d"
                    )
                }

                HStack {
                    Label("\(metrics.session.interruptionCount)", systemImage: "waveform.path")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)
                    Spacer()
                    if metrics.session.silenceDurationCurrent > 10 {
                        Label(
                            "\(Int(metrics.session.silenceDurationCurrent))s silence",
                            systemImage: "speaker.slash.fill"
                        )
                        .font(.caption)
                        .foregroundColor(NerdyTheme.nudgeSuggestion)
                    }
                }
            }
        }
    }

    private var effectiveEyeContact: Double {
        averagedMetric(tutor: metrics.tutor.eyeContactScore, student: metrics.student.eyeContactScore)
    }

    private var effectiveEnergy: Double {
        averagedMetric(tutor: metrics.tutor.energyScore, student: metrics.student.energyScore)
    }

    private var talkBalance: Double {
        1.0 - abs(metrics.tutor.talkTimePercent - 0.5) * 2
    }

    private var hasStudentSignal: Bool {
        metrics.student.eyeContactScore > 0 ||
        metrics.student.talkTimePercent > 0 ||
        metrics.student.isSpeaking
    }

    private func averagedMetric(tutor: Double, student: Double) -> Double {
        hasStudentSignal ? (tutor + student) / 2 : tutor
    }
}

struct LiveCaptureSurfaceView: View {
    @ObservedObject var controller: LiveCaptureController
    let sessionDuration: String
    var captureStatusMessage: String?
    var syncStatusMessage: String?
    var syncStatusAccentColor: Color = NerdyTheme.cyan
    var showCameraPreview: Bool = true

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                .fill(NerdyTheme.backgroundCard)

            #if os(iOS)
            if showCameraPreview {
                CameraPreviewView(controller: controller)
                    .clipShape(RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium))
            }
            #endif

            LinearGradient(
                colors: [Color.black.opacity(0.12), Color.black.opacity(0.55)],
                startPoint: .top,
                endPoint: .bottom
            )
            .clipShape(RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium))

            VStack {
                HStack {
                    analysisPill
                    Spacer()
                }
                Spacer()

                VStack(spacing: 8) {
                    if !controller.isRunning {
                        Image(systemName: "video.fill")
                            .font(.system(size: 36))
                            .foregroundColor(NerdyTheme.cyan)
                    }

                    Text(sessionDuration)
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .foregroundStyle(NerdyTheme.gradientAccent)
                }

                // Glass status banners overlaid at bottom of video
                if captureStatusMessage != nil || syncStatusMessage != nil {
                    VStack(spacing: 6) {
                        if let captureStatusMessage {
                            GlassStatusPill(message: captureStatusMessage, symbol: "info.circle.fill", accentColor: NerdyTheme.cyan)
                        }
                        if let syncStatusMessage {
                            GlassStatusPill(message: syncStatusMessage, symbol: "icloud.fill", accentColor: syncStatusAccentColor)
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(14)
        }
        .frame(minHeight: 340)
        .overlay(
            RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private var analysisPill: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(controller.isRunning ? NerdyTheme.cyan : Color.red)
                .frame(width: 8, height: 8)
            Text(controller.isRunning ? "LIVE CAPTURE" : "WAITING")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.black.opacity(0.35)))
    }
}

struct GlassStatusPill: View {
    let message: String
    var symbol: String = "info.circle.fill"
    var accentColor: Color = NerdyTheme.cyan

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: symbol)
                .font(.caption2)
                .foregroundColor(accentColor)
            Text(message)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.85))
                .lineLimit(2)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(.ultraThinMaterial)
                .opacity(0.85)
        )
    }
}

struct SessionStatusBanner: View {
    let message: String
    var symbol: String = "info.circle.fill"
    var accentColor: Color = NerdyTheme.cyan

    var body: some View {
        NerdyCard {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: symbol)
                    .foregroundColor(accentColor)
                Text(message)
                    .font(.caption)
                    .foregroundColor(NerdyTheme.textSecondary)
            }
        }
    }
}

#if os(iOS)
struct CameraPreviewView: UIViewRepresentable {
    @ObservedObject var controller: LiveCaptureController

    func makeUIView(context: Context) -> PreviewContainerView {
        let view = PreviewContainerView()
        view.previewLayer.videoGravity = .resizeAspectFill
        view.previewLayer.session = controller.captureSession
        return view
    }

    func updateUIView(_ uiView: PreviewContainerView, context: Context) {
        if uiView.previewLayer.session !== controller.captureSession {
            uiView.previewLayer.session = controller.captureSession
        }
    }
}

final class PreviewContainerView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}
#endif

struct TrendBadge: View {
    let trend: EngagementTrend

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: trendIcon)
                .font(.caption2)
            Text(trend.rawValue.capitalized)
                .font(.caption2)
                .fontWeight(.semibold)
        }
        .foregroundColor(trendColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(trendColor.opacity(0.2)))
    }

    private var trendIcon: String {
        switch trend {
        case .rising: return "arrow.up.right"
        case .stable: return "arrow.right"
        case .declining: return "arrow.down.right"
        }
    }

    private var trendColor: Color {
        switch trend {
        case .rising: return NerdyTheme.cyan
        case .stable: return NerdyTheme.blue
        case .declining: return NerdyTheme.nudgeSuggestion
        }
    }
}

struct SpeakingIndicatorView: View {
    let tutorSpeaking: Bool
    let studentSpeaking: Bool

    var body: some View {
        HStack(spacing: 16) {
            speakerPill(label: "Tutor", isSpeaking: tutorSpeaking)
            speakerPill(label: "Student", isSpeaking: studentSpeaking)
        }
    }

    private func speakerPill(label: String, isSpeaking: Bool) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(isSpeaking ? NerdyTheme.cyan : NerdyTheme.textMuted)
                .frame(width: 8, height: 8)
                .scaleEffect(isSpeaking ? 1.2 : 1.0)
                .animation(.easeInOut(duration: 0.3).repeatWhile(isSpeaking), value: isSpeaking)
            Text(label)
                .font(.subheadline)
                .foregroundColor(isSpeaking ? .white : NerdyTheme.textSecondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(isSpeaking ? NerdyTheme.backgroundElevated : NerdyTheme.backgroundCard)
                .overlay(
                    Capsule()
                        .stroke(isSpeaking ? NerdyTheme.cyan.opacity(0.3) : Color.clear, lineWidth: 1)
                )
        )
    }
}

struct NudgePillView: View {
    let nudge: CoachingNudge
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: nudgeIcon)
                .foregroundColor(nudgeColor)

            Text(nudge.message)
                .font(.caption)
                .foregroundColor(.white)
                .lineLimit(2)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption2)
                    .foregroundColor(NerdyTheme.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                        .stroke(nudgeColor.opacity(0.3), lineWidth: 1)
                )
        )
        .frame(maxWidth: 280)
    }

    private var nudgeIcon: String {
        switch nudge.nudgeType {
        case .engagementCheck: return "questionmark.bubble.fill"
        case .attentionAlert: return "eye.trianglebadge.exclamationmark.fill"
        case .talkTimeBalance: return "scale.3d"
        case .energyDrop: return "battery.25"
        case .interruptionSpike: return "hand.raised.fill"
        case .positiveReinforcement: return "hand.thumbsup.fill"
        }
    }

    private var nudgeColor: Color {
        switch nudge.priority {
        case .low: return NerdyTheme.nudgeInfo
        case .medium: return NerdyTheme.nudgeSuggestion
        case .high: return NerdyTheme.nudgeAlert
        }
    }
}

// MARK: - Animation Extension

extension Animation {
    func repeatWhile(_ condition: Bool) -> Animation {
        condition ? self.repeatForever(autoreverses: true) : self
    }
}

// MARK: - Preview

struct SessionView_Previews: PreviewProvider {
    static var previews: some View {
        SessionView()
            .environmentObject(AppState())
    }
}
