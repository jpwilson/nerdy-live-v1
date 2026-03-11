import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Tab = .session

    enum Tab: String, CaseIterable {
        case session = "Session"
        case analytics = "Analytics"
        case settings = "Settings"

        var icon: String {
            switch self {
            case .session: return "video.fill"
            case .analytics: return "chart.bar.fill"
            case .settings: return "gearshape.fill"
            }
        }
    }

    var body: some View {
        Group {
            if appState.isAuthenticated {
                TabView(selection: $selectedTab) {
                    ForEach(Tab.allCases, id: \.self) { tab in
                        tabContent(for: tab)
                            .tabItem {
                                Image(systemName: tab.icon)
                                Text(tab.rawValue)
                            }
                            .tag(tab)
                    }
                }
                .tint(NerdyTheme.cyan)
            } else {
                LoginView()
            }
        }
        .task {
            await appState.restoreSession()
        }
    }

    @ViewBuilder
    private func tabContent(for tab: Tab) -> some View {
        switch tab {
        case .session:
            SessionView(
                authenticatedTutorId: appState.authenticatedTutorId,
                supabaseService: appState.supabaseService
            )
        case .analytics:
            AnalyticsDashboardView()
        case .settings:
            SettingsView()
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var totalSessions = 0
    @State private var averageEngagement = 0
    @State private var coachingScore = 0.0

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 80))
                        .foregroundStyle(NerdyTheme.gradientAccent)

                    Text(appState.tutorProfile?.name ?? "Tutor")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)

                    if let email = appState.authService.currentUser?.email {
                        Text(email)
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                    }

                    NerdyCard {
                        VStack(alignment: .leading, spacing: 16) {
                            ProfileRow(label: "Sessions", value: "\(totalSessions)")
                            ProfileRow(label: "Avg. Engagement", value: "\(averageEngagement)%")
                            ProfileRow(label: "Coaching Score", value: String(format: "%.1f/5", coachingScore))
                        }
                    }

                    Spacer()

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
                .padding()
            }
            .navigationTitle("Profile")
            .onAppear {
                loadStats()
            }
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
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

struct ProfileRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(NerdyTheme.textSecondary)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(.white)
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AppState())
    }
}
