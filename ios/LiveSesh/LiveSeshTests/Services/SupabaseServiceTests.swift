import XCTest
@testable import LiveSesh

final class SupabaseServiceTests: XCTestCase {

    // MARK: - Mock Service Tests

    func testMockSaveSession() async throws {
        let mock = MockSupabaseService()
        let session = TestData.makeSession()

        try await mock.saveSession(session)

        XCTAssertEqual(mock.savedSessions.count, 1)
        XCTAssertEqual(mock.savedSessions.first?.id, session.id)
    }

    func testMockSaveSummary() async throws {
        let mock = MockSupabaseService()
        let summary = TestData.makeSummary()

        try await mock.saveSummary(summary)

        XCTAssertEqual(mock.savedSummaries.count, 1)
    }

    func testMockSaveSnapshot() async throws {
        let mock = MockSupabaseService()
        let snapshot = MetricsSnapshot(from: TestData.makeMetrics(), sessionId: UUID())

        try await mock.saveMetricsSnapshot(snapshot)

        XCTAssertEqual(mock.savedSnapshots.count, 1)
    }

    func testMockSaveNudge() async throws {
        let mock = MockSupabaseService()
        let nudge = TestData.makeNudge()

        try await mock.saveNudge(nudge)

        XCTAssertEqual(mock.savedNudges.count, 1)
    }

    func testMockErrorThrows() async {
        let mock = MockSupabaseService()
        mock.shouldThrowError = true

        do {
            try await mock.saveSession(TestData.makeSession())
            XCTFail("Should have thrown")
        } catch {
            XCTAssertEqual(error as? SupabaseError, .httpError(statusCode: 500))
        }
    }

    func testMockFetchSessions() async throws {
        let mock = MockSupabaseService()
        let session = TestData.makeSession()
        mock.fetchSessionsResult = [session]

        let results = try await mock.fetchSessions(tutorId: TestData.tutorId)
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results.first?.id, session.id)
    }

    func testMockFetchSummary() async throws {
        let mock = MockSupabaseService()
        let summary = TestData.makeSummary()
        mock.fetchSummariesResult = [summary]

        let result = try await mock.fetchSummary(sessionId: summary.sessionId)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.engagementScore, 72)
    }

    func testMockFetchTrends() async throws {
        let mock = MockSupabaseService()
        let trends = try await mock.fetchTutorTrends(tutorId: UUID(), days: 30)
        XCTAssertEqual(trends.averageEngagement, 75)
        XCTAssertEqual(trends.sessionCount, 10)
    }

    // MARK: - SupabaseError Tests

    func testSupabaseErrorEquality() {
        XCTAssertEqual(SupabaseError.invalidResponse, SupabaseError.invalidResponse)
        XCTAssertEqual(SupabaseError.httpError(statusCode: 404), SupabaseError.httpError(statusCode: 404))
        XCTAssertNotEqual(SupabaseError.httpError(statusCode: 404), SupabaseError.httpError(statusCode: 500))
    }

    // MARK: - JSON Encoder/Decoder Configuration

    func testSupabaseEncoderUsesSnakeCase() throws {
        let metrics = ParticipantMetrics(
            eyeContactScore: 0.85,
            talkTimePercent: 0.6,
            energyScore: 0.7,
            isSpeaking: true
        )
        let data = try JSONEncoder.supabase.encode(metrics)
        let json = String(data: data, encoding: .utf8)!

        XCTAssertTrue(json.contains("eye_contact_score"))
        XCTAssertTrue(json.contains("talk_time_percent"))
        XCTAssertFalse(json.contains("eyeContactScore"))
    }

    func testSupabaseDecoderUsesSnakeCase() throws {
        let json = """
        {"eye_contact_score":0.85,"talk_time_percent":0.6,"energy_score":0.7,"is_speaking":true}
        """
        let data = json.data(using: .utf8)!
        let metrics = try JSONDecoder.supabase.decode(ParticipantMetrics.self, from: data)

        XCTAssertEqual(metrics.eyeContactScore, 0.85)
        XCTAssertEqual(metrics.talkTimePercent, 0.6)
        XCTAssertEqual(metrics.isSpeaking, true)
    }
}
