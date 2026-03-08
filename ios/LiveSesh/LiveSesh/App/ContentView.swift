import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Tab = .session

    enum Tab: String, CaseIterable {
        case session = "Session"
        case analytics = "Analytics"
        case profile = "Profile"

        var icon: String {
            switch self {
            case .session: return "video.fill"
            case .analytics: return "chart.bar.fill"
            case .profile: return "person.fill"
            }
        }
    }

    var body: some View {
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
    }

    @ViewBuilder
    private func tabContent(for tab: Tab) -> some View {
        switch tab {
        case .session:
            SessionView()
        case .analytics:
            AnalyticsDashboardView()
        case .profile:
            ProfileView()
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

                    Text("Tutor Profile")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)

                    NerdyCard {
                        VStack(alignment: .leading, spacing: 16) {
                            ProfileRow(label: "Sessions", value: "\(totalSessions)")
                            ProfileRow(label: "Avg. Engagement", value: "\(averageEngagement)%")
                            ProfileRow(label: "Coaching Score", value: String(format: "%.1f/5", coachingScore))
                        }
                    }

                    Spacer()
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
