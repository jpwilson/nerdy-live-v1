import SwiftUI

@main
struct LiveSeshApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentSession: LiveSession?
    @Published var tutorProfile: TutorProfile?

    let supabaseService = SupabaseService()
    let sessionStore = SessionStore()
}
