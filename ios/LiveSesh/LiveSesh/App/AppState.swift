import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var userRole: UserRole?
    @Published var currentSession: LiveSession?
    @Published var tutorProfile: TutorProfile?
    @Published var testModeEnabled: Bool {
        didSet { UserDefaults.standard.set(testModeEnabled, forKey: "testModeEnabled") }
    }
    @Published var roomCode: String {
        didSet { UserDefaults.standard.set(roomCode, forKey: "roomCode") }
    }
    @Published var showAnalysisOverlays: Bool {
        didSet { UserDefaults.standard.set(showAnalysisOverlays, forKey: "showAnalysisOverlays") }
    }

    let authService = AuthService()
    let supabaseService: SupabaseService
    let sessionStore = SessionStore()

    private var cancellables = Set<AnyCancellable>()

    init() {
        self.testModeEnabled = UserDefaults.standard.bool(forKey: "testModeEnabled")
        self.roomCode = UserDefaults.standard.string(forKey: "roomCode") ?? "demo-room"
        self.showAnalysisOverlays = UserDefaults.standard.bool(forKey: "showAnalysisOverlays")
        let service = SupabaseService()
        self.supabaseService = service
        // Wire live auth token into Supabase REST calls
        service.dynamicAccessTokenProvider = { [weak self] in
            self?.authService.accessToken
        }
        observeAuth()
    }

    /// Attempt to restore a previous auth session on launch.
    func restoreSession() async {
        await authService.restoreSession()
    }

    /// The authenticated user's UUID, used as tutor_id for sessions and RLS.
    var authenticatedTutorId: UUID? {
        authService.currentUser?.id
    }

    /// Alias for authenticatedTutorId (works for both roles).
    var authenticatedUserId: UUID? {
        authService.currentUser?.id
    }

    /// The current access token for authenticated Supabase requests.
    var currentAccessToken: String? {
        authService.accessToken
    }

    private func observeAuth() {
        authService.$currentUser
            .map { $0 != nil }
            .assign(to: &$isAuthenticated)

        authService.$selectedRole
            .assign(to: &$userRole)

        authService.$currentUser
            .compactMap { $0 }
            .sink { [weak self] user in
                self?.tutorProfile = TutorProfile(
                    id: user.id,
                    name: user.email?.components(separatedBy: "@").first ?? "Tutor",
                    email: user.email ?? "",
                    totalSessions: 0,
                    averageEngagement: 0,
                    coachingScore: 0
                )
            }
            .store(in: &cancellables)
    }
}
