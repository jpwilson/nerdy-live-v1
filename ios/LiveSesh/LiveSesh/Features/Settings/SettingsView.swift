import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var totalSessions = 0
    @State private var averageEngagement = 0
    @State private var coachingScore = 0.0

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        profileSection
                        connectionSection
                        testModeSection
                        signOutSection
                    }
                    .padding()
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                loadStats()
            }
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
        }
    }

    // MARK: - Profile Section

    private var profileSection: some View {
        NerdyCard {
            VStack(spacing: 16) {
                HStack(spacing: 12) {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(NerdyTheme.gradientAccent)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(appState.tutorProfile?.name ?? "Tutor")
                            .font(.title3)
                            .fontWeight(.bold)
                            .foregroundColor(.white)

                        if let email = appState.authService.currentUser?.email {
                            Text(email)
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textSecondary)
                        }
                    }

                    Spacer()
                }

                Divider()
                    .background(NerdyTheme.textMuted)

                ProfileRow(label: "Sessions", value: "\(totalSessions)")
                ProfileRow(label: "Avg. Engagement", value: "\(averageEngagement)%")
                ProfileRow(label: "Coaching Score", value: String(format: "%.1f/5", coachingScore))
            }
        }
    }

    // MARK: - Connection Section

    private var connectionSection: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                Label("Room Connection", systemImage: "link")
                    .font(.headline)
                    .foregroundColor(.white)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Room Code")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)

                    TextField("Enter room code", text: $appState.roomCode)
                        .textFieldStyle(NerdyTextFieldStyle())
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        #endif
                }

                Text("Share this room code with your student. They can join from the web app at the same room URL.")
                    .font(.caption2)
                    .foregroundColor(NerdyTheme.textMuted)
            }
        }
    }

    // MARK: - Test Mode Section

    private var testModeSection: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                Label("Developer", systemImage: "wrench.and.screwdriver")
                    .font(.headline)
                    .foregroundColor(.white)

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Test Mode")
                            .foregroundColor(.white)
                        Text("Analyze your own camera feed as if it were the student. No WebRTC connection needed.")
                            .font(.caption2)
                            .foregroundColor(NerdyTheme.textMuted)
                    }

                    Spacer()

                    Toggle("", isOn: $appState.testModeEnabled)
                        .tint(NerdyTheme.cyan)
                        .labelsHidden()
                }

                if appState.testModeEnabled {
                    HStack(spacing: 8) {
                        Image(systemName: "info.circle.fill")
                            .foregroundColor(NerdyTheme.nudgeSuggestion)
                        Text("Test mode is active. Metrics will be labeled as self-test data.")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.nudgeSuggestion)
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                            .fill(NerdyTheme.nudgeSuggestion.opacity(0.1))
                    )
                }
            }
        }
    }

    // MARK: - Sign Out Section

    private var signOutSection: some View {
        Button {
            appState.authService.signOut()
        } label: {
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("Sign Out")
            }
            .foregroundColor(NerdyTheme.textSecondary)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                    .stroke(NerdyTheme.textMuted, lineWidth: 1)
            )
        }
    }

    private func loadStats() {
        let summaries = appState.sessionStore.getAllSummaries()
        totalSessions = summaries.count

        guard !summaries.isEmpty else {
            averageEngagement = 0
            coachingScore = 0
            return
        }

        let avgScore = summaries.map(\.engagementScore).reduce(0, +) / Double(summaries.count)
        averageEngagement = Int(avgScore.rounded())
        coachingScore = min(5.0, max(0.0, (avgScore / 100.0) * 5.0))
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
            .environmentObject(AppState())
    }
}
