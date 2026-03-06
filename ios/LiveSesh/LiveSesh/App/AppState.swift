import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentSession: LiveSession?
    @Published var tutorProfile: TutorProfile?

    let supabaseService = SupabaseService()
    let sessionStore = SessionStore()
}
