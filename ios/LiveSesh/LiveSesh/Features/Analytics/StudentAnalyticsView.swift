import SwiftUI
import Charts

// MARK: - Student List View

struct StudentListView: View {
    private let sessionStore = SessionStore()
    @State private var students: [(name: String, sessionCount: Int, lastSessionDate: Date, avgEngagement: Double)] = []

    var body: some View {
        ZStack {
            NerdyTheme.backgroundGradient
                .ignoresSafeArea()

            if students.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "person.3")
                        .font(.system(size: 40))
                        .foregroundColor(NerdyTheme.textMuted)
                    Text("No students yet")
                        .font(.headline)
                        .foregroundColor(NerdyTheme.textSecondary)
                    Text("Student names are captured when they join via WebRTC.")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(students, id: \.name) { student in
                            NavigationLink(destination: StudentDetailView(studentName: student.name)) {
                                StudentRowCard(
                                    name: student.name,
                                    sessionCount: student.sessionCount,
                                    lastDate: student.lastSessionDate,
                                    avgEngagement: student.avgEngagement
                                )
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Students")
        #if os(iOS)
        .toolbarColorScheme(.light, for: .navigationBar)
        #endif
        .onAppear { loadStudents() }
    }

    private func loadStudents() {
        let raw = sessionStore.getUniqueStudents()
        let summaries = sessionStore.getAllSummaries()
        let summaryBySession = Dictionary(uniqueKeysWithValues: summaries.map { ($0.sessionId, $0) })

        students = raw.map { student in
            let sessions = sessionStore.getSessions(studentName: student.name)
            let scores = sessions.compactMap { summaryBySession[$0.id]?.engagementScore }
            let avg = scores.isEmpty ? 0.0 : scores.reduce(0, +) / Double(scores.count)
            return (name: student.name, sessionCount: student.sessionCount,
                    lastSessionDate: student.lastSessionDate, avgEngagement: avg)
        }
    }
}

struct StudentRowCard: View {
    let name: String
    let sessionCount: Int
    let lastDate: Date
    let avgEngagement: Double

    var body: some View {
        NerdyCard {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(name)
                        .font(.headline)
                        .foregroundColor(NerdyTheme.textPrimary)
                    HStack(spacing: 12) {
                        Label("\(sessionCount) sessions", systemImage: "video.fill")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        Label(lastDate.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                    }
                }
                Spacer()
                if avgEngagement > 0 {
                    EngagementBadge(score: avgEngagement)
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(NerdyTheme.textMuted)
            }
        }
    }
}

// MARK: - Student Detail View (per-student analytics)

struct StudentDetailView: View {
    let studentName: String
    private let sessionStore = SessionStore()

    @State private var sessions: [LiveSession] = []
    @State private var summaries: [SessionSummary] = []
    @State private var avgEngagement: Double = 0
    @State private var totalSessions: Int = 0
    @State private var engagementTrend: String = "—"

    var body: some View {
        ZStack {
            NerdyTheme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    VStack(spacing: 8) {
                        Text(studentName)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(NerdyTheme.textPrimary)
                        Text("\(totalSessions) session\(totalSessions == 1 ? "" : "s")")
                            .foregroundColor(NerdyTheme.textSecondary)
                    }
                    .padding(.top, 16)

                    // Stat cards
                    HStack(spacing: 12) {
                        StatCard(
                            title: "Avg. Score",
                            value: avgEngagement > 0 ? "\(Int(avgEngagement))%" : "—",
                            icon: "chart.line.uptrend.xyaxis",
                            color: NerdyTheme.cyan
                        )
                        StatCard(
                            title: "Trend",
                            value: engagementTrend,
                            icon: "arrow.up.right",
                            color: NerdyTheme.blue
                        )
                    }

                    // Engagement over time chart
                    if summaries.count >= 2 {
                        studentEngagementChart
                    }

                    // Session list
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Session History")
                            .font(.headline)
                            .foregroundColor(NerdyTheme.textPrimary)

                        ForEach(summaries) { summary in
                            NavigationLink(destination: SessionDetailView(summary: summary)) {
                                SessionSummaryCard(summary: summary)
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle(studentName)
        #if os(iOS)
        .toolbarColorScheme(.light, for: .navigationBar)
        #endif
        .onAppear { loadData() }
    }

    private var studentEngagementChart: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Engagement Over Time")
                    .font(.headline)
                    .foregroundColor(NerdyTheme.textPrimary)

                Chart(summaries) { summary in
                    LineMark(
                        x: .value("Date", summary.createdAt),
                        y: .value("Score", summary.engagementScore)
                    )
                    .foregroundStyle(NerdyTheme.cyan)
                    .interpolationMethod(.catmullRom)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))

                    PointMark(
                        x: .value("Date", summary.createdAt),
                        y: .value("Score", summary.engagementScore)
                    )
                    .foregroundStyle(NerdyTheme.cyan)
                    .symbolSize(40)

                    AreaMark(
                        x: .value("Date", summary.createdAt),
                        y: .value("Score", summary.engagementScore)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [NerdyTheme.cyan.opacity(0.2), NerdyTheme.cyan.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }
                .chartYScale(domain: 0...100)
                .chartYAxis {
                    AxisMarks(values: [0, 25, 50, 75, 100]) { value in
                        AxisGridLine()
                            .foregroundStyle(Color.black.opacity(0.08))
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text("\(Int(v))")
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
                            if let date = value.as(Date.self) {
                                Text(date.formatted(.dateTime.month(.abbreviated).day()))
                                    .font(.caption2)
                                    .foregroundColor(NerdyTheme.textMuted)
                            }
                        }
                    }
                }
                .frame(height: 180)
            }
        }
    }

    private func loadData() {
        sessions = sessionStore.getSessions(studentName: studentName)
        totalSessions = sessions.count

        let allSummaries = sessionStore.getAllSummaries()
        let sessionIds = Set(sessions.map(\.id))
        summaries = allSummaries
            .filter { sessionIds.contains($0.sessionId) }
            .sorted { $0.createdAt < $1.createdAt }

        let scores = summaries.map(\.engagementScore)
        avgEngagement = scores.isEmpty ? 0 : scores.reduce(0, +) / Double(scores.count)

        if scores.count >= 2 {
            let recent = scores.suffix(min(3, scores.count)).reduce(0, +) / Double(min(3, scores.count))
            let older = scores.prefix(min(3, scores.count)).reduce(0, +) / Double(min(3, scores.count))
            engagementTrend = recent > older + 2 ? "Improving" : recent < older - 2 ? "Declining" : "Stable"
        }
    }
}
