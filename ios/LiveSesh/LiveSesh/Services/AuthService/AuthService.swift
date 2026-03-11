import Foundation
import Combine

struct AuthSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: AuthUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }
}

struct AuthUser: Codable, Equatable {
    let id: UUID
    let email: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
    }
}

@MainActor
final class AuthService: ObservableObject {
    @Published private(set) var currentUser: AuthUser?
    @Published private(set) var accessToken: String?
    @Published private(set) var isLoading = false
    @Published var error: String?

    var isAuthenticated: Bool { currentUser != nil && accessToken != nil }

    private let baseURL: URL
    private let apiKey: String
    private let session: URLSession
    private var refreshTimer: Timer?

    private static let accessTokenKey = "livesesh_auth_access_token"
    private static let refreshTokenKey = "livesesh_auth_refresh_token"
    private static let userIdKey = "livesesh_auth_user_id"
    private static let userEmailKey = "livesesh_auth_user_email"

    nonisolated static let defaultSupabaseURL = SupabaseConfig.url
    nonisolated static let defaultSupabaseAnonKey = SupabaseConfig.anonKey

    init(baseURL: URL? = nil, apiKey: String? = nil, session: URLSession = .shared) {
        let infoDictionary = Bundle.main.infoDictionary ?? [:]

        let configuredURL = Self.normalizedValue(baseURL?.absoluteString)
            ?? Self.normalizedValue(infoDictionary["SUPABASE_URL"] as? String)
            ?? Self.normalizedValue(ProcessInfo.processInfo.environment["SUPABASE_URL"])
            ?? Self.defaultSupabaseURL

        let configuredAPIKey = Self.normalizedValue(apiKey)
            ?? Self.normalizedValue(infoDictionary["SUPABASE_ANON_KEY"] as? String)
            ?? Self.normalizedValue(ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"])
            ?? Self.defaultSupabaseAnonKey

        self.baseURL = URL(string: configuredURL) ?? URL(string: Self.defaultSupabaseURL)!
        self.apiKey = configuredAPIKey
        self.session = session
    }

    // MARK: - Session Restore

    func restoreSession() async {
        guard let storedAccessToken = UserDefaults.standard.string(forKey: Self.accessTokenKey),
              let storedRefreshToken = UserDefaults.standard.string(forKey: Self.refreshTokenKey),
              let userIdString = UserDefaults.standard.string(forKey: Self.userIdKey),
              let userId = UUID(uuidString: userIdString) else {
            return
        }

        let email = UserDefaults.standard.string(forKey: Self.userEmailKey)

        // Try to refresh the token to ensure it's still valid
        do {
            let refreshed = try await refreshAccessToken(refreshToken: storedRefreshToken)
            self.accessToken = refreshed.accessToken
            self.currentUser = refreshed.user
            persistTokens(accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, user: refreshed.user)
            scheduleRefresh(expiresIn: refreshed.expiresIn)
        } catch {
            // Token expired or invalid - try using stored token to get user
            self.accessToken = storedAccessToken
            self.currentUser = AuthUser(id: userId, email: email)
            // The next API call will fail if token is truly expired, which is fine
        }
    }

    // MARK: - Email OTP

    func sendOTP(email: String) async throws {
        isLoading = true
        error = nil
        defer { isLoading = false }

        let url = baseURL.appendingPathComponent("/auth/v1/otp")
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(["email": email])

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw AuthError.serverError(statusCode: httpResponse.statusCode, message: body)
        }
    }

    func verifyOTP(email: String, token: String) async throws {
        isLoading = true
        error = nil
        defer { isLoading = false }

        let url = baseURL.appendingPathComponent("/auth/v1/verify")
        var request = makeRequest(url: url, method: "POST")

        let body: [String: String] = [
            "email": email,
            "token": token,
            "type": "email"
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw AuthError.serverError(statusCode: httpResponse.statusCode, message: body)
        }

        let authSession = try JSONDecoder().decode(AuthSession.self, from: data)
        self.accessToken = authSession.accessToken
        self.currentUser = authSession.user
        persistTokens(accessToken: authSession.accessToken, refreshToken: authSession.refreshToken, user: authSession.user)
        scheduleRefresh(expiresIn: authSession.expiresIn)
    }

    // MARK: - Demo Login

    /// Sign in with the pre-created demo account (email + password).
    /// Evaluators can use this to skip the OTP flow entirely.
    func signInDemo() async throws {
        isLoading = true
        error = nil
        defer { isLoading = false }

        let url = baseURL.appendingPathComponent("/auth/v1/token")
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "password")]

        var request = makeRequest(url: components.url!, method: "POST")
        let body: [String: String] = [
            "email": "demo@livesesh.app",
            "password": "DemoPass123!"
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let responseBody = String(data: data, encoding: .utf8) ?? ""
            throw AuthError.serverError(statusCode: httpResponse.statusCode, message: responseBody)
        }

        let authSession = try JSONDecoder().decode(AuthSession.self, from: data)
        self.accessToken = authSession.accessToken
        self.currentUser = authSession.user
        persistTokens(accessToken: authSession.accessToken, refreshToken: authSession.refreshToken, user: authSession.user)
        scheduleRefresh(expiresIn: authSession.expiresIn)
    }

    // MARK: - Sign Out

    func signOut() {
        refreshTimer?.invalidate()
        refreshTimer = nil
        accessToken = nil
        currentUser = nil
        clearPersistedTokens()
    }

    // MARK: - Token Refresh

    private func refreshAccessToken(refreshToken: String) async throws -> AuthSession {
        let url = baseURL.appendingPathComponent("/auth/v1/token")
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]

        var request = makeRequest(url: components.url!, method: "POST")
        request.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw AuthError.tokenRefreshFailed
        }

        return try JSONDecoder().decode(AuthSession.self, from: data)
    }

    private func scheduleRefresh(expiresIn: Int) {
        refreshTimer?.invalidate()
        // Refresh 60 seconds before expiry
        let refreshInterval = max(TimeInterval(expiresIn) - 60, 30)
        refreshTimer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.attemptTokenRefresh()
            }
        }
    }

    private func attemptTokenRefresh() async {
        guard let refreshToken = UserDefaults.standard.string(forKey: Self.refreshTokenKey) else { return }

        do {
            let refreshed = try await refreshAccessToken(refreshToken: refreshToken)
            self.accessToken = refreshed.accessToken
            self.currentUser = refreshed.user
            persistTokens(accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, user: refreshed.user)
            scheduleRefresh(expiresIn: refreshed.expiresIn)
        } catch {
            // Refresh failed - user will need to re-authenticate on next protected call
            signOut()
        }
    }

    // MARK: - Persistence

    private func persistTokens(accessToken: String, refreshToken: String, user: AuthUser) {
        let defaults = UserDefaults.standard
        defaults.set(accessToken, forKey: Self.accessTokenKey)
        defaults.set(refreshToken, forKey: Self.refreshTokenKey)
        defaults.set(user.id.uuidString, forKey: Self.userIdKey)
        defaults.set(user.email, forKey: Self.userEmailKey)
    }

    private func clearPersistedTokens() {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: Self.accessTokenKey)
        defaults.removeObject(forKey: Self.refreshTokenKey)
        defaults.removeObject(forKey: Self.userIdKey)
        defaults.removeObject(forKey: Self.userEmailKey)
    }

    // MARK: - Helpers

    private func makeRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private static func normalizedValue(_ rawValue: String?) -> String? {
        guard let trimmed = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty,
              !trimmed.hasPrefix("$(") else {
            return nil
        }
        return trimmed
    }
}

enum AuthError: LocalizedError {
    case invalidResponse
    case serverError(statusCode: Int, message: String)
    case tokenRefreshFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Could not reach the authentication server."
        case .serverError(let code, let message):
            if code == 422 { return "Invalid code. Please check and try again." }
            return "Authentication error (\(code)): \(message)"
        case .tokenRefreshFailed:
            return "Your session has expired. Please sign in again."
        }
    }
}
