import SwiftUI
import AVFoundation
import WebRTC
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
            .toolbar {
                ToolbarItem(placement: .principal) {
                    NerdyLogo()
                }
            }
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
        }
        .overlay(alignment: .topTrailing) {
            nudgeOverlay
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
        }
    }

    // MARK: - Active Session View

    private var activeSessionView: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Test mode / connection status bar
                if isTestMode {
                    activeTestModePill
                        .padding(.horizontal)
                } else if !roomCode.isEmpty {
                    activeConnectionPill
                        .padding(.horizontal)
                }

                // Camera preview with glass status overlays
                // Only show the camera preview in test mode (self-analysis).
                // In normal mode the front camera runs for analysis only;
                // the tutor doesn't need to see themselves on screen.
                LiveCaptureSurfaceView(
                    controller: viewModel.liveCaptureController,
                    sessionDuration: viewModel.sessionDuration,
                    captureStatusMessage: captureStatusMessage,
                    syncStatusMessage: syncStatusMessage,
                    syncStatusAccentColor: syncStatusAccentColor,
                    showCameraPreview: isTestMode
                )
                .padding(.horizontal)

                // Student video feed (via WebRTC)
                if !isTestMode {
                    studentVideoSection
                        .padding(.horizontal)
                }

                // Live Metrics Dashboard (inline)
                LiveMetricsDashboardView(metrics: viewModel.currentMetrics)
                    .padding(.horizontal)

                // Speaking Indicator
                SpeakingIndicatorView(
                    tutorSpeaking: viewModel.currentMetrics.tutor.isSpeaking,
                    studentSpeaking: viewModel.currentMetrics.student.isSpeaking
                )
                .padding(.horizontal)

                // End Session Button
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
        }
        .scrollIndicators(.hidden)
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

    private var studentVideoSection: some View {
        NerdyCard {
            VStack(spacing: 8) {
                HStack {
                    Text("Student Feed")
                        .font(.headline)
                        .foregroundColor(.white)
                    Spacer()
                    if let name = viewModel.studentDisplayName {
                        Text(name)
                            .font(.caption)
                            .foregroundColor(NerdyTheme.cyan)
                    }
                }

                #if os(iOS)
                if let track = viewModel.webRTCService.remoteVideoTrack {
                    RTCVideoViewRepresentable(videoTrack: track)
                        .frame(height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall))
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                            .fill(NerdyTheme.backgroundElevated)
                        VStack(spacing: 8) {
                            Image(systemName: viewModel.webRTCConnectionState == .waitingForStudent
                                  ? "person.fill.questionmark" : "video.fill")
                                .font(.title2)
                                .foregroundColor(NerdyTheme.textMuted)
                            Text(viewModel.webRTCConnectionState == .waitingForStudent
                                 ? "Waiting for student to join..."
                                 : viewModel.webRTCConnectionState == .studentConnected
                                    ? "Connecting video..."
                                    : "Student video will appear here")
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textSecondary)
                        }
                    }
                    .frame(height: 200)
                }
                #endif
            }
        }
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
