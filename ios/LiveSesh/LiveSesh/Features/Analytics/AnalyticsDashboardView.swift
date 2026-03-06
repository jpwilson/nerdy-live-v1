import SwiftUI

struct AnalyticsDashboardView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AnalyticsViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                NerdyTheme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        overviewCards
                        recentSessionsList
                    }
                    .padding()
                }
            }
            .navigationTitle("Analytics")
            #if os(iOS)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
        }
    }

    // MARK: - Overview Cards

    private var overviewCards: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                StatCard(
                    title: "Sessions",
                    value: "\(viewModel.totalSessions)",
                    icon: "video.fill",
                    color: NerdyTheme.cyan
                )
                StatCard(
                    title: "Avg. Score",
                    value: "\(Int(viewModel.averageEngagement))%",
                    icon: "chart.line.uptrend.xyaxis",
                    color: NerdyTheme.blue
                )
            }

            HStack(spacing: 12) {
                StatCard(
                    title: "Talk Balance",
                    value: viewModel.talkBalanceLabel,
                    icon: "scale.3d",
                    color: NerdyTheme.purple
                )
                StatCard(
                    title: "Trend",
                    value: viewModel.overallTrend,
                    icon: "arrow.up.right",
                    color: NerdyTheme.cyan
                )
            }
        }
    }

    // MARK: - Session History

    private var recentSessionsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Sessions")
                .font(.headline)
                .foregroundColor(.white)

            if viewModel.recentSummaries.isEmpty {
                NerdyCard {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: "tray")
                                .font(.system(size: 32))
                                .foregroundColor(NerdyTheme.textMuted)
                            Text("No sessions yet")
                                .foregroundColor(NerdyTheme.textSecondary)
                            Text("Start a session to see analytics here")
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textMuted)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 24)
                }
            } else {
                ForEach(viewModel.recentSummaries) { summary in
                    NavigationLink(destination: SessionDetailView(summary: summary)) {
                        SessionSummaryCard(summary: summary)
                    }
                }
            }
        }
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon)
                        .foregroundColor(color)
                    Spacer()
                }
                Text(value)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text(title)
                    .font(.caption)
                    .foregroundColor(NerdyTheme.textSecondary)
            }
        }
    }
}

// MARK: - Session Summary Card

struct SessionSummaryCard: View {
    let summary: SessionSummary

    var body: some View {
        NerdyCard {
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(summary.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                        Text("\(summary.durationMinutes) min")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                    }
                    Spacer()
                    EngagementBadge(score: summary.engagementScore)
                }

                HStack(spacing: 16) {
                    MiniMetric(
                        icon: "eye.fill",
                        label: "Eye Contact",
                        value: summary.avgEyeContact.student,
                        color: NerdyTheme.cyan
                    )
                    MiniMetric(
                        icon: "waveform",
                        label: "Talk Balance",
                        value: summary.talkTimeRatio.student,
                        color: NerdyTheme.purple
                    )
                    MiniMetric(
                        icon: "bolt.fill",
                        label: "Interrupts",
                        value: Double(summary.totalInterruptions),
                        isCount: true,
                        color: NerdyTheme.orange
                    )
                }
            }
        }
    }
}

struct EngagementBadge: View {
    let score: Double

    var body: some View {
        Text("\(Int(score))")
            .font(.system(size: 18, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .frame(width: 44, height: 44)
            .background(Circle().fill(NerdyTheme.engagementColor(for: score / 100)))
    }
}

struct MiniMetric: View {
    let icon: String
    let label: String
    let value: Double
    var isCount: Bool = false
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(color)
            Text(isCount ? "\(Int(value))" : "\(Int(value * 100))%")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(NerdyTheme.textMuted)
        }
    }
}

// MARK: - Session Detail View

struct SessionDetailView: View {
    let summary: SessionSummary

    var body: some View {
        ZStack {
            NerdyTheme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // Score Header
                    VStack(spacing: 8) {
                        Text("\(Int(summary.engagementScore))")
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .foregroundStyle(NerdyTheme.gradientAccent)

                        Text("Engagement Score")
                            .foregroundColor(NerdyTheme.textSecondary)
                    }
                    .padding(.top, 20)

                    // Detailed Metrics
                    NerdyCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Session Metrics")
                                .font(.headline)
                                .foregroundColor(.white)

                            MetricRow(label: "Duration", value: "\(summary.durationMinutes) min")
                            MetricRow(label: "Tutor Talk Time", value: "\(Int(summary.talkTimeRatio.tutor * 100))%")
                            MetricRow(label: "Student Talk Time", value: "\(Int(summary.talkTimeRatio.student * 100))%")
                            MetricRow(label: "Tutor Eye Contact", value: "\(Int(summary.avgEyeContact.tutor * 100))%")
                            MetricRow(label: "Student Eye Contact", value: "\(Int(summary.avgEyeContact.student * 100))%")
                            MetricRow(label: "Interruptions", value: "\(summary.totalInterruptions)")
                        }
                    }

                    // Key Moments
                    if !summary.keyMoments.isEmpty {
                        NerdyCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Key Moments")
                                    .font(.headline)
                                    .foregroundColor(.white)

                                ForEach(summary.keyMoments) { moment in
                                    HStack(alignment: .top) {
                                        Text(moment.timestamp)
                                            .font(.caption)
                                            .foregroundColor(NerdyTheme.cyan)
                                            .frame(width: 60, alignment: .leading)
                                        Text(moment.description)
                                            .font(.caption)
                                            .foregroundColor(NerdyTheme.textSecondary)
                                    }
                                }
                            }
                        }
                    }

                    // Recommendations
                    NerdyCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Recommendations")
                                .font(.headline)
                                .foregroundColor(.white)

                            ForEach(summary.recommendations, id: \.self) { rec in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "lightbulb.fill")
                                        .font(.caption)
                                        .foregroundColor(NerdyTheme.yellow)
                                    Text(rec)
                                        .font(.subheadline)
                                        .foregroundColor(NerdyTheme.textSecondary)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Session Detail")
        #if os(iOS)
        .toolbarColorScheme(.dark, for: .navigationBar)
        #endif
    }
}

struct MetricRow: View {
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

// MARK: - View Model

@MainActor
final class AnalyticsViewModel: ObservableObject {
    @Published var totalSessions = 0
    @Published var averageEngagement: Double = 0
    @Published var talkBalanceLabel = "—"
    @Published var overallTrend = "—"
    @Published var recentSummaries: [SessionSummary] = []

    private let sessionStore: SessionStore

    init(sessionStore: SessionStore = SessionStore()) {
        self.sessionStore = sessionStore
        loadData()
    }

    func loadData() {
        let summaries = sessionStore.getAllSummaries()
        recentSummaries = summaries.sorted { $0.createdAt > $1.createdAt }
        totalSessions = summaries.count

        if !summaries.isEmpty {
            averageEngagement = summaries.map(\.engagementScore).reduce(0, +) / Double(summaries.count)

            let avgTutorTalk = summaries.map(\.talkTimeRatio.tutor).reduce(0, +) / Double(summaries.count)
            talkBalanceLabel = "\(Int(avgTutorTalk * 100))/\(Int((1 - avgTutorTalk) * 100))"

            if summaries.count >= 2 {
                let recent = summaries.prefix(3).map(\.engagementScore).reduce(0, +) / 3
                let older = summaries.suffix(3).map(\.engagementScore).reduce(0, +) / 3
                overallTrend = recent > older ? "Improving" : recent < older ? "Declining" : "Stable"
            }
        }
    }
}

#Preview {
    AnalyticsDashboardView()
        .environmentObject(AppState())
}
