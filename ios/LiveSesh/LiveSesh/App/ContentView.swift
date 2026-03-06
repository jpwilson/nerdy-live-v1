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
                            ProfileRow(label: "Sessions", value: "24")
                            ProfileRow(label: "Avg. Engagement", value: "78%")
                            ProfileRow(label: "Coaching Score", value: "4.2/5")
                        }
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Profile")
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
        }
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

#Preview {
    ContentView()
        .environmentObject(AppState())
}
