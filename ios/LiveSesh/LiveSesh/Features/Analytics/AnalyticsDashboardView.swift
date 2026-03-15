import SwiftUI
import Charts

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
                        studentsSection
                        recentSessionsList
                    }
                    .padding()
                }
            }
            .navigationTitle("Analytics")
            .onAppear {
                viewModel.loadData()
            }
            #if os(iOS)
            .toolbarColorScheme(.light, for: .navigationBar)
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

    // MARK: - Students Section

    private var studentsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink(destination: StudentListView()) {
                NerdyCard {
                    HStack {
                        Image(systemName: "person.3.fill")
                            .foregroundColor(NerdyTheme.purple)
                            .font(.title3)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Per-Student Analytics")
                                .font(.headline)
                                .foregroundColor(NerdyTheme.textPrimary)
                            Text("Track engagement trends for each student over time")
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textSecondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(NerdyTheme.textMuted)
                    }
                }
            }
        }
    }

    // MARK: - Session History

    private var recentSessionsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Sessions")
                .font(.headline)
                .foregroundColor(NerdyTheme.textPrimary)

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
                    .foregroundColor(NerdyTheme.textPrimary)
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
                            .foregroundColor(NerdyTheme.textPrimary)
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
                .foregroundColor(NerdyTheme.textPrimary)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(NerdyTheme.textMuted)
        }
    }
}

// MARK: - Session Detail View

struct SessionDetailView: View {
    let summary: SessionSummary
    @State private var snapshots: [MetricsSnapshot] = []
    private let sessionStore = SessionStore()

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

                    // Engagement Timeline
                    if snapshots.count >= 2 {
                        engagementTimelineCard
                    }

                    // Detailed Metrics
                    NerdyCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Session Metrics")
                                .font(.headline)
                                .foregroundColor(NerdyTheme.textPrimary)

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
                                    .foregroundColor(NerdyTheme.textPrimary)

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

                    // Battery & Device
                    if let battery = summary.batteryUsage {
                        BatteryUsageCard(battery: battery)
                    }

                    // Recommendations
                    NerdyCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Recommendations")
                                .font(.headline)
                                .foregroundColor(NerdyTheme.textPrimary)

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
        .toolbarColorScheme(.light, for: .navigationBar)
        #endif
        .onAppear {
            snapshots = sessionStore.getSnapshots(sessionId: summary.sessionId)
                .sorted { $0.timestamp < $1.timestamp }
        }
    }

    // MARK: - Engagement Timeline Chart

    private var engagementTimelineCard: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Engagement Timeline")
                    .font(.headline)
                    .foregroundColor(NerdyTheme.textPrimary)

                engagementChart
                    .frame(height: 180)

                // Legend
                HStack(spacing: 16) {
                    chartLegendItem(color: NerdyTheme.cyan, label: "Eye Contact")
                    chartLegendItem(color: NerdyTheme.purple, label: "Energy")
                    chartLegendItem(color: NerdyTheme.orange, label: "Talk Balance")
                }
                .font(.caption2)
            }
        }
    }

    private var engagementChart: some View {
        let dataPoints = buildChartData()
        return Chart(dataPoints) { point in
            LineMark(
                x: .value("Time", point.elapsed),
                y: .value("Value", point.value)
            )
            .foregroundStyle(by: .value("Metric", point.metric))
            .interpolationMethod(.catmullRom)
            .lineStyle(StrokeStyle(lineWidth: 2))

            AreaMark(
                x: .value("Time", point.elapsed),
                y: .value("Value", point.value)
            )
            .foregroundStyle(by: .value("Metric", point.metric))
            .opacity(0.08)
        }
        .chartForegroundStyleScale([
            "Eye Contact": NerdyTheme.cyan,
            "Energy": NerdyTheme.purple,
            "Talk Balance": NerdyTheme.orange
        ])
        .chartYScale(domain: 0...1)
        .chartYAxis {
            AxisMarks(values: [0, 0.25, 0.5, 0.75, 1.0]) { value in
                AxisGridLine()
                    .foregroundStyle(Color.black.opacity(0.08))
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text("\(Int(v * 100))%")
                            .font(.caption2)
                            .foregroundColor(NerdyTheme.textMuted)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisGridLine()
                    .foregroundStyle(Color.black.opacity(0.04))
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(formatMinutes(v))
                            .font(.caption2)
                            .foregroundColor(NerdyTheme.textMuted)
                    }
                }
            }
        }
        .chartLegend(.hidden)
    }

    private func chartLegendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .foregroundColor(NerdyTheme.textSecondary)
        }
    }

    private func formatMinutes(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func buildChartData() -> [TimelineDataPoint] {
        guard let firstTimestamp = snapshots.first?.timestamp else { return [] }

        // Downsample to ~60 points max for smooth rendering
        let stride = max(1, snapshots.count / 60)
        let sampled = Swift.stride(from: 0, to: snapshots.count, by: stride).map { snapshots[$0] }

        var points: [TimelineDataPoint] = []
        for snap in sampled {
            let elapsed = snap.timestamp.timeIntervalSince(firstTimestamp)

            let eyeContact = averagedOrTutor(tutor: snap.tutorEyeContact, student: snap.studentEyeContact)
            points.append(TimelineDataPoint(elapsed: elapsed, value: eyeContact, metric: "Eye Contact"))

            let energy = averagedOrTutor(tutor: snap.tutorEnergy, student: snap.studentEnergy)
            points.append(TimelineDataPoint(elapsed: elapsed, value: energy, metric: "Energy"))

            let talkBalance = 1.0 - abs(snap.tutorTalkPct - 0.5) * 2
            points.append(TimelineDataPoint(elapsed: elapsed, value: max(0, talkBalance), metric: "Talk Balance"))
        }
        return points
    }

    private func averagedOrTutor(tutor: Double, student: Double) -> Double {
        student > 0 ? (tutor + student) / 2 : tutor
    }
}

private struct TimelineDataPoint: Identifiable {
    let id = UUID()
    let elapsed: Double   // seconds from session start
    let value: Double     // 0.0–1.0
    let metric: String    // series name
}

struct BatteryUsageCard: View {
    let battery: BatteryUsage
    @State private var isExpanded = false

    var body: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isExpanded.toggle()
                    }
                } label: {
                    HStack {
                        Image(systemName: "battery.50")
                            .foregroundColor(batteryColor)
                        Text("Device & Battery")
                            .font(.headline)
                            .foregroundColor(NerdyTheme.textPrimary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textMuted)
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    }
                }

                if isExpanded {
                    VStack(alignment: .leading, spacing: 12) {
                        Divider()
                            .background(NerdyTheme.textMuted.opacity(0.3))
                            .padding(.vertical, 8)

                        MetricRow(
                            label: "Battery Used",
                            value: String(format: "%.1f%%", battery.percentUsed)
                        )
                        MetricRow(
                            label: "Start Level",
                            value: "\(Int(battery.startLevel * 100))%"
                        )
                        MetricRow(
                            label: "End Level",
                            value: "\(Int(battery.endLevel * 100))%"
                        )
                        MetricRow(
                            label: "Charging",
                            value: battery.wasCharging ? "Yes" : "No"
                        )

                        if battery.percentUsed > 0 {
                            HStack(spacing: 6) {
                                Image(systemName: "info.circle")
                                    .font(.caption2)
                                    .foregroundColor(NerdyTheme.textMuted)
                                Text("Includes all device activity during the session, not just this app.")
                                    .font(.caption2)
                                    .foregroundColor(NerdyTheme.textMuted)
                            }
                            .padding(.top, 4)
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    private var batteryColor: Color {
        if battery.wasCharging { return NerdyTheme.cyan }
        if battery.percentUsed > 10 { return NerdyTheme.orange }
        if battery.percentUsed > 5 { return NerdyTheme.yellow }
        return NerdyTheme.cyan
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
                .foregroundColor(NerdyTheme.textPrimary)
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
                let recentWindow = Array(summaries.prefix(min(3, summaries.count)))
                let olderWindow = Array(summaries.suffix(min(3, summaries.count)))
                let recent = recentWindow.map(\.engagementScore).reduce(0, +) / Double(recentWindow.count)
                let older = olderWindow.map(\.engagementScore).reduce(0, +) / Double(olderWindow.count)
                overallTrend = recent > older ? "Improving" : recent < older ? "Declining" : "Stable"
            } else {
                overallTrend = "Stable"
            }
        }
    }
}

struct AnalyticsDashboardView_Previews: PreviewProvider {
    static var previews: some View {
        AnalyticsDashboardView()
            .environmentObject(AppState())
    }
}
