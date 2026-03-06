import XCTest
@testable import LiveSesh

final class SessionStoreTests: XCTestCase {
    var store: SessionStore!
    var testDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        testDefaults = UserDefaults(suiteName: "com.livesesh.tests.\(UUID().uuidString)")!
        store = SessionStore(defaults: testDefaults)
    }

    override func tearDown() {
        store.clearAll()
        testDefaults.removePersistentDomain(forName: testDefaults.suiteName ?? "")
        store = nil
        testDefaults = nil
        super.tearDown()
    }

    // MARK: - Session CRUD

    func testSaveAndRetrieveSession() {
        let session = TestData.makeSession()
        store.saveSession(session)

        let retrieved = store.getSession(id: session.id)
        XCTAssertNotNil(retrieved)
        XCTAssertEqual(retrieved?.id, session.id)
        XCTAssertEqual(retrieved?.subject, "Algebra")
    }

    func testSaveMultipleSessions() {
        let session1 = TestData.makeSession(subject: "Math")
        let session2 = TestData.makeSession(subject: "Science")

        store.saveSession(session1)
        store.saveSession(session2)

        let all = store.getAllSessions()
        XCTAssertEqual(all.count, 2)
    }

    func testUpdateExistingSession() {
        var session = TestData.makeSession()
        store.saveSession(session)

        session.endedAt = Date()
        session.engagementScore = 85.0
        store.saveSession(session)

        let all = store.getAllSessions()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.engagementScore, 85.0)
        XCTAssertNotNil(all.first?.endedAt)
    }

    func testDeleteSession() {
        let session = TestData.makeSession()
        store.saveSession(session)
        store.deleteSession(id: session.id)

        XCTAssertNil(store.getSession(id: session.id))
        XCTAssertTrue(store.getAllSessions().isEmpty)
    }

    func testDeleteSessionAlsoDeletesRelatedData() {
        let session = TestData.makeSession()
        store.saveSession(session)

        let summary = TestData.makeSummary(sessionId: session.id)
        store.saveSummary(summary)

        let nudge = TestData.makeNudge(sessionId: session.id)
        store.saveNudge(nudge)

        store.deleteSession(id: session.id)

        XCTAssertNil(store.getSummary(sessionId: session.id))
        XCTAssertTrue(store.getNudges(sessionId: session.id).isEmpty)
    }

    func testGetNonExistentSession() {
        let result = store.getSession(id: UUID())
        XCTAssertNil(result)
    }

    // MARK: - Summary CRUD

    func testSaveAndRetrieveSummary() {
        let sessionId = UUID()
        let summary = TestData.makeSummary(sessionId: sessionId)
        store.saveSummary(summary)

        let retrieved = store.getSummary(sessionId: sessionId)
        XCTAssertNotNil(retrieved)
        XCTAssertEqual(retrieved?.engagementScore, 72)
        XCTAssertEqual(retrieved?.totalInterruptions, 8)
    }

    func testGetAllSummaries() {
        let summary1 = TestData.makeSummary(sessionId: UUID(), engagement: 80)
        let summary2 = TestData.makeSummary(sessionId: UUID(), engagement: 60)

        store.saveSummary(summary1)
        store.saveSummary(summary2)

        let all = store.getAllSummaries()
        XCTAssertEqual(all.count, 2)
    }

    // MARK: - Snapshot Storage

    func testSaveAndRetrieveSnapshots() {
        let sessionId = UUID()
        let metrics = TestData.makeMetrics()
        let snapshot = MetricsSnapshot(from: metrics, sessionId: sessionId)

        store.saveSnapshot(snapshot)

        let retrieved = store.getSnapshots(sessionId: sessionId)
        XCTAssertEqual(retrieved.count, 1)
        XCTAssertEqual(retrieved.first?.sessionId, sessionId)
    }

    func testSnapshotsSortedByTimestamp() {
        let sessionId = UUID()

        for i in 0..<5 {
            let metrics = EngagementMetrics(
                tutor: .empty, student: .empty, session: .empty,
                timestamp: Date().addingTimeInterval(Double(i))
            )
            let snapshot = MetricsSnapshot(from: metrics, sessionId: sessionId)
            store.saveSnapshot(snapshot)
        }

        let retrieved = store.getSnapshots(sessionId: sessionId)
        XCTAssertEqual(retrieved.count, 5)

        // Verify sorted
        for i in 1..<retrieved.count {
            XCTAssertGreaterThanOrEqual(retrieved[i].timestamp, retrieved[i-1].timestamp)
        }
    }

    func testSnapshotsFilteredBySession() {
        let session1 = UUID()
        let session2 = UUID()

        store.saveSnapshot(MetricsSnapshot(from: .empty, sessionId: session1))
        store.saveSnapshot(MetricsSnapshot(from: .empty, sessionId: session1))
        store.saveSnapshot(MetricsSnapshot(from: .empty, sessionId: session2))

        XCTAssertEqual(store.getSnapshots(sessionId: session1).count, 2)
        XCTAssertEqual(store.getSnapshots(sessionId: session2).count, 1)
    }

    // MARK: - Nudge Storage

    func testSaveAndRetrieveNudges() {
        let sessionId = UUID()
        let nudge = TestData.makeNudge(sessionId: sessionId)
        store.saveNudge(nudge)

        let retrieved = store.getNudges(sessionId: sessionId)
        XCTAssertEqual(retrieved.count, 1)
        XCTAssertEqual(retrieved.first?.nudgeType, .engagementCheck)
    }

    func testNudgesFilteredBySession() {
        let session1 = UUID()
        let session2 = UUID()

        store.saveNudge(TestData.makeNudge(sessionId: session1))
        store.saveNudge(TestData.makeNudge(sessionId: session1))
        store.saveNudge(TestData.makeNudge(sessionId: session2))

        XCTAssertEqual(store.getNudges(sessionId: session1).count, 2)
        XCTAssertEqual(store.getNudges(sessionId: session2).count, 1)
    }

    // MARK: - Clear All

    func testClearAll() {
        store.saveSession(TestData.makeSession())
        store.saveSummary(TestData.makeSummary())
        store.saveNudge(TestData.makeNudge())

        store.clearAll()

        XCTAssertTrue(store.getAllSessions().isEmpty)
        XCTAssertTrue(store.getAllSummaries().isEmpty)
    }

    // MARK: - Encoding/Decoding Stability

    func testSessionEncodingDecoding() {
        let session = LiveSession(
            id: UUID(),
            tutorId: UUID(),
            studentId: UUID(),
            subject: "Physics",
            studentLevel: .college,
            startedAt: Date(),
            endedAt: Date(),
            engagementScore: 88.5
        )
        store.saveSession(session)

        let retrieved = store.getSession(id: session.id)
        XCTAssertEqual(retrieved?.subject, "Physics")
        XCTAssertEqual(retrieved?.studentLevel, .college)
        XCTAssertEqual(retrieved?.engagementScore, 88.5)
    }

    func testSummaryWithKeyMoments() {
        let summary = SessionSummary(
            id: UUID(),
            sessionId: UUID(),
            durationMinutes: 30,
            talkTimeRatio: TalkTimeRatio(tutor: 0.55, student: 0.45),
            avgEyeContact: EyeContactSummary(tutor: 0.80, student: 0.65),
            totalInterruptions: 3,
            engagementScore: 82,
            keyMoments: [
                KeyMoment(timestamp: "00:05:12", type: "energy_spike", description: "Both participants very engaged"),
                KeyMoment(timestamp: "00:15:30", type: "attention_drop", description: "Student looked away")
            ],
            recommendations: ["Keep the pace varied", "Good use of questions"],
            createdAt: Date()
        )

        store.saveSummary(summary)
        let retrieved = store.getSummary(sessionId: summary.sessionId)

        XCTAssertEqual(retrieved?.keyMoments.count, 2)
        XCTAssertEqual(retrieved?.recommendations.count, 2)
    }
}
