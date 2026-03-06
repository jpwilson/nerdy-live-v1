import Foundation

protocol SupabaseServiceProtocol {
    func saveSession(_ session: LiveSession) async throws
    func saveSummary(_ summary: SessionSummary) async throws
    func saveMetricsSnapshot(_ snapshot: MetricsSnapshot) async throws
    func saveNudge(_ nudge: CoachingNudge) async throws

    func fetchSessions(tutorId: UUID) async throws -> [LiveSession]
    func fetchSummary(sessionId: UUID) async throws -> SessionSummary?
    func fetchSummaries(tutorId: UUID) async throws -> [SessionSummary]
    func fetchTutorTrends(tutorId: UUID, days: Int) async throws -> TutorTrends
}

struct TutorTrends: Codable, Equatable {
    let tutorId: UUID
    let days: Int
    let averageEngagement: Double
    let sessionCount: Int
    let engagementByDate: [DateEngagement]
    let topRecommendations: [String]
}

struct DateEngagement: Codable, Equatable {
    let date: String
    let score: Double
}

final class SupabaseService: SupabaseServiceProtocol {
    private let baseURL: URL
    private let apiKey: String
    private let session: URLSession

    init(baseURL: URL? = nil, apiKey: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL ?? URL(string: "https://your-project.supabase.co")!
        self.apiKey = apiKey ?? ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? ""
        self.session = session
    }

    // MARK: - Save Operations

    func saveSession(_ liveSession: LiveSession) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/sessions")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder.supabase.encode(liveSession)
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    func saveSummary(_ summary: SessionSummary) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/session_summaries")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder.supabase.encode(summary)
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    func saveMetricsSnapshot(_ snapshot: MetricsSnapshot) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/metrics_snapshots")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder.supabase.encode(snapshot)
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    func saveNudge(_ nudge: CoachingNudge) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/coaching_nudges")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder.supabase.encode(nudge)
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Fetch Operations

    func fetchSessions(tutorId: UUID) async throws -> [LiveSession] {
        var components = URLComponents(url: baseURL.appendingPathComponent("/rest/v1/sessions"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "tutor_id", value: "eq.\(tutorId.uuidString)"),
            URLQueryItem(name: "order", value: "started_at.desc"),
            URLQueryItem(name: "limit", value: "50")
        ]
        let request = makeRequest(url: components.url!, method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try JSONDecoder.supabase.decode([LiveSession].self, from: data)
    }

    func fetchSummary(sessionId: UUID) async throws -> SessionSummary? {
        var components = URLComponents(url: baseURL.appendingPathComponent("/rest/v1/session_summaries"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "session_id", value: "eq.\(sessionId.uuidString)")
        ]
        let request = makeRequest(url: components.url!, method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        let summaries = try JSONDecoder.supabase.decode([SessionSummary].self, from: data)
        return summaries.first
    }

    func fetchSummaries(tutorId: UUID) async throws -> [SessionSummary] {
        let url = baseURL.appendingPathComponent("/functions/v1/tutor-summaries")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(["tutor_id": tutorId.uuidString])
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try JSONDecoder.supabase.decode([SessionSummary].self, from: data)
    }

    func fetchTutorTrends(tutorId: UUID, days: Int) async throws -> TutorTrends {
        var components = URLComponents(url: baseURL.appendingPathComponent("/functions/v1/tutor-trends"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "tutor_id", value: tutorId.uuidString),
            URLQueryItem(name: "days", value: "\(days)")
        ]
        let request = makeRequest(url: components.url!, method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try JSONDecoder.supabase.decode(TutorTrends.self, from: data)
    }

    // MARK: - Helpers

    private func makeRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        return request
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SupabaseError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw SupabaseError.httpError(statusCode: httpResponse.statusCode)
        }
    }
}

enum SupabaseError: Error, Equatable {
    case invalidResponse
    case httpError(statusCode: Int)
    case decodingError
}

// MARK: - JSON Coders

extension JSONEncoder {
    static let supabase: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

extension JSONDecoder {
    static let supabase: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
