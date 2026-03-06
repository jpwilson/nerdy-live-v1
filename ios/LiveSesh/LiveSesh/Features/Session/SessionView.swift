import SwiftUI
import AVFoundation

struct SessionView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = SessionViewModel()

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

            NerdyButton("Start Session", icon: "video.fill") {
                viewModel.startSession()
            }

            Spacer()
        }
    }

    // MARK: - Active Session View

    private var activeSessionView: some View {
        VStack(spacing: 16) {
            // Camera preview placeholder
            ZStack {
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                    .fill(NerdyTheme.backgroundCard)
                    .frame(height: 240)

                VStack(spacing: 8) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 40))
                        .foregroundColor(NerdyTheme.cyan)
                    Text("Camera Preview")
                        .foregroundColor(NerdyTheme.textSecondary)

                    // Session timer
                    Text(viewModel.sessionDuration)
                        .font(.system(size: 24, weight: .bold, design: .monospaced))
                        .foregroundStyle(NerdyTheme.gradientAccent)
                }

                // Analysis active indicator
                HStack {
                    Spacer()
                    VStack {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                            Text("ANALYZING")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.red.opacity(0.3)))
                        Spacer()
                    }
                }
                .padding(12)
            }
            .padding(.horizontal)

            // Live Metrics Dashboard (inline)
            LiveMetricsDashboardView(metrics: viewModel.currentMetrics)
                .padding(.horizontal)

            // Speaking Indicator
            SpeakingIndicatorView(
                tutorSpeaking: viewModel.currentMetrics.tutor.isSpeaking,
                studentSpeaking: viewModel.currentMetrics.student.isSpeaking
            )
            .padding(.horizontal)

            Spacer()

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
            .padding(.bottom, 8)
        }
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
                        value: (metrics.tutor.eyeContactScore + metrics.student.eyeContactScore) / 2,
                        icon: "eye.fill"
                    )
                    MetricGauge(
                        label: "Energy",
                        value: (metrics.tutor.energyScore + metrics.student.energyScore) / 2,
                        icon: "bolt.fill"
                    )
                    MetricGauge(
                        label: "Balance",
                        value: 1.0 - abs(metrics.tutor.talkTimePercent - 0.5) * 2,
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
}

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

#Preview {
    SessionView()
        .environmentObject(AppState())
}
