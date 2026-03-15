import SwiftUI

struct CoachingSettingsView: View {
    @Binding var config: CoachingConfig
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Sensitivity
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Sensitivity Level")
                                    .font(.headline)
                                    .foregroundColor(NerdyTheme.textPrimary)

                                Text("Controls how often and how aggressively nudges appear")
                                    .font(.caption)
                                    .foregroundColor(NerdyTheme.textSecondary)

                                Picker("Sensitivity", selection: $config.sensitivity) {
                                    ForEach(CoachingSensitivity.allCases, id: \.self) { level in
                                        Text(level.rawValue).tag(level)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }
                        }

                        // Cooldown
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Nudge Cooldown")
                                    .font(.headline)
                                    .foregroundColor(NerdyTheme.textPrimary)

                                HStack {
                                    Text("\(Int(config.nudgeCooldownSeconds))s")
                                        .foregroundColor(NerdyTheme.cyan)
                                        .frame(width: 50)
                                    Slider(
                                        value: $config.nudgeCooldownSeconds,
                                        in: 15...300,
                                        step: 15
                                    )
                                    .tint(NerdyTheme.cyan)
                                }
                            }
                        }

                        // Thresholds
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Thresholds")
                                    .font(.headline)
                                    .foregroundColor(NerdyTheme.textPrimary)

                                ThresholdSlider(
                                    label: "Silence Alert",
                                    value: $config.silenceThresholdSeconds,
                                    range: 60...600,
                                    step: 30,
                                    unit: "s"
                                )

                                ThresholdSlider(
                                    label: "Eye Contact Min",
                                    value: $config.eyeContactThreshold,
                                    range: 0.1...0.6,
                                    step: 0.05,
                                    unit: "%",
                                    isPercent: true
                                )

                                ThresholdSlider(
                                    label: "Talk Imbalance",
                                    value: $config.talkTimeImbalanceThreshold,
                                    range: 0.6...0.95,
                                    step: 0.05,
                                    unit: "%",
                                    isPercent: true
                                )

                                ThresholdSlider(
                                    label: "Energy Drop",
                                    value: $config.energyDropThreshold,
                                    range: 0.05...0.4,
                                    step: 0.05,
                                    unit: "%",
                                    isPercent: true
                                )
                            }
                        }

                        // Enabled Nudge Types
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Enabled Nudges")
                                    .font(.headline)
                                    .foregroundColor(NerdyTheme.textPrimary)

                                ForEach(NudgeType.allCases, id: \.self) { type in
                                    Toggle(isOn: Binding(
                                        get: { config.enabledNudgeTypes.contains(type) },
                                        set: { enabled in
                                            if enabled {
                                                config.enabledNudgeTypes.insert(type)
                                            } else {
                                                config.enabledNudgeTypes.remove(type)
                                            }
                                        }
                                    )) {
                                        Text(nudgeTypeLabel(type))
                                            .foregroundColor(NerdyTheme.textPrimary)
                                    }
                                    .tint(NerdyTheme.cyan)
                                }
                            }
                        }

                        // Presets
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Quick Presets")
                                    .font(.headline)
                                    .foregroundColor(NerdyTheme.textPrimary)

                                HStack(spacing: 12) {
                                    PresetButton(label: "Relaxed", isSelected: config == .low) {
                                        config = .low
                                    }
                                    PresetButton(label: "Balanced", isSelected: config == .default) {
                                        config = .default
                                    }
                                    PresetButton(label: "Intensive", isSelected: config == .high) {
                                        config = .high
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Coaching Settings")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.light, for: .navigationBar)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(NerdyTheme.cyan)
                }
            }
        }
    }

    private func nudgeTypeLabel(_ type: NudgeType) -> String {
        switch type {
        case .engagementCheck: return "Engagement Check"
        case .attentionAlert: return "Attention Alert"
        case .talkTimeBalance: return "Talk Time Balance"
        case .energyDrop: return "Energy Drop"
        case .interruptionSpike: return "Interruption Alert"
        case .positiveReinforcement: return "Positive Reinforcement"
        }
    }
}

struct ThresholdSlider: View {
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let unit: String
    var isPercent: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.subheadline)
                    .foregroundColor(NerdyTheme.textSecondary)
                Spacer()
                Text(isPercent ? "\(Int(value * 100))\(unit)" : "\(Int(value))\(unit)")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(NerdyTheme.cyan)
            }
            Slider(value: $value, in: range, step: step)
                .tint(NerdyTheme.cyan)
        }
    }
}

struct PresetButton: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(isSelected ? NerdyTheme.textPrimary : NerdyTheme.textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                        .fill(isSelected ? NerdyTheme.cyan.opacity(0.3) : NerdyTheme.backgroundElevated)
                        .overlay(
                            RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                                .stroke(isSelected ? NerdyTheme.cyan : Color.clear, lineWidth: 1)
                        )
                )
        }
    }
}

struct CoachingSettingsView_Previews: PreviewProvider {
    static var previews: some View {
        CoachingSettingsView(config: .constant(.default))
    }
}
