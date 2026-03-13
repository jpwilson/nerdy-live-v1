import Foundation

protocol SessionStoreProtocol {
    func saveSession(_ session: LiveSession)
    func saveSummary(_ summary: SessionSummary)
    func saveSnapshot(_ snapshot: MetricsSnapshot)
    func saveNudge(_ nudge: CoachingNudge)

    func getSession(id: UUID) -> LiveSession?
    func getAllSessions() -> [LiveSession]
    func getSummary(sessionId: UUID) -> SessionSummary?
    func getAllSummaries() -> [SessionSummary]
    func getSnapshots(sessionId: UUID) -> [MetricsSnapshot]
    func getNudges(sessionId: UUID) -> [CoachingNudge]

    func deleteSession(id: UUID)
    func clearAll()
}

final class SessionStore: SessionStoreProtocol {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder.supabase
    private let decoder = JSONDecoder.supabase

    private enum Keys {
        static let sessions = "livesesh_sessions"
        static let summaries = "livesesh_summaries"
        static let snapshots = "livesesh_snapshots"
        static let nudges = "livesesh_nudges"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - Save

    func saveSession(_ session: LiveSession) {
        var sessions = getAllSessions()
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
        } else {
            sessions.append(session)
        }
        save(sessions, forKey: Keys.sessions)
    }

    func saveSummary(_ summary: SessionSummary) {
        var summaries = getAllSummaries()
        summaries.append(summary)
        save(summaries, forKey: Keys.summaries)
    }

    func saveSnapshot(_ snapshot: MetricsSnapshot) {
        var snapshots = loadArray(MetricsSnapshot.self, forKey: Keys.snapshots)
        snapshots.append(snapshot)

        // Keep only last 1000 snapshots per session to limit storage
        let grouped = Dictionary(grouping: snapshots) { $0.sessionId }
        var pruned: [MetricsSnapshot] = []
        for (_, sessionSnapshots) in grouped {
            pruned.append(contentsOf: sessionSnapshots.suffix(1000))
        }

        save(pruned, forKey: Keys.snapshots)
    }

    func saveNudge(_ nudge: CoachingNudge) {
        var nudges = loadArray(CoachingNudge.self, forKey: Keys.nudges)
        nudges.append(nudge)
        save(nudges, forKey: Keys.nudges)
    }

    // MARK: - Fetch

    func getSession(id: UUID) -> LiveSession? {
        getAllSessions().first { $0.id == id }
    }

    func getAllSessions() -> [LiveSession] {
        loadArray(LiveSession.self, forKey: Keys.sessions)
    }

    func getSummary(sessionId: UUID) -> SessionSummary? {
        getAllSummaries().first { $0.sessionId == sessionId }
    }

    func getAllSummaries() -> [SessionSummary] {
        loadArray(SessionSummary.self, forKey: Keys.summaries)
    }

    func getSnapshots(sessionId: UUID) -> [MetricsSnapshot] {
        loadArray(MetricsSnapshot.self, forKey: Keys.snapshots)
            .filter { $0.sessionId == sessionId }
            .sorted { $0.timestamp < $1.timestamp }
    }

    func getNudges(sessionId: UUID) -> [CoachingNudge] {
        loadArray(CoachingNudge.self, forKey: Keys.nudges)
            .filter { $0.sessionId == sessionId }
            .sorted { $0.timestamp < $1.timestamp }
    }

    func getSessions(studentName: String) -> [LiveSession] {
        getAllSessions().filter { $0.studentName == studentName }
            .sorted { $0.startedAt > $1.startedAt }
    }

    func getUniqueStudents() -> [(name: String, sessionCount: Int, lastSessionDate: Date)] {
        let sessions = getAllSessions().filter { $0.studentName != nil }
        let grouped = Dictionary(grouping: sessions) { $0.studentName! }
        return grouped.map { (name, sessions) in
            let sorted = sessions.sorted { $0.startedAt > $1.startedAt }
            return (name: name, sessionCount: sessions.count, lastSessionDate: sorted.first!.startedAt)
        }
        .sorted { $0.lastSessionDate > $1.lastSessionDate }
    }

    // MARK: - Delete

    func deleteSession(id: UUID) {
        var sessions = getAllSessions()
        sessions.removeAll { $0.id == id }
        save(sessions, forKey: Keys.sessions)

        var summaries = getAllSummaries()
        summaries.removeAll { $0.sessionId == id }
        save(summaries, forKey: Keys.summaries)

        var snapshots = loadArray(MetricsSnapshot.self, forKey: Keys.snapshots)
        snapshots.removeAll { $0.sessionId == id }
        save(snapshots, forKey: Keys.snapshots)

        var nudges = loadArray(CoachingNudge.self, forKey: Keys.nudges)
        nudges.removeAll { $0.sessionId == id }
        save(nudges, forKey: Keys.nudges)
    }

    func clearAll() {
        defaults.removeObject(forKey: Keys.sessions)
        defaults.removeObject(forKey: Keys.summaries)
        defaults.removeObject(forKey: Keys.snapshots)
        defaults.removeObject(forKey: Keys.nudges)
    }

    // MARK: - Helpers

    private func save<T: Encodable>(_ items: [T], forKey key: String) {
        if let data = try? encoder.encode(items) {
            defaults.set(data, forKey: key)
        }
    }

    private func loadArray<T: Decodable>(_ type: T.Type, forKey key: String) -> [T] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? decoder.decode([T].self, from: data)) ?? []
    }
}
