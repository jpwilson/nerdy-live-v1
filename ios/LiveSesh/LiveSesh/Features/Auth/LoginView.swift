import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState

    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var selectedRole: UserRole = .tutor
    @State private var isSignUp = false
    @State private var errorMessage: String?

    // OTP fallback
    @State private var showOTPFlow = false
    @State private var otpCode = ""
    @State private var isAwaitingCode = false

    private var authService: AuthService { appState.authService }

    var body: some View {
        ZStack {
            NerdyTheme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    Spacer().frame(height: 40)

                    // Logo
                    VStack(spacing: 8) {
                        Text("nerdy")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundStyle(NerdyTheme.gradientLiveAI)

                        Text("Live Session Analysis")
                            .font(.subheadline)
                            .foregroundColor(NerdyTheme.textSecondary)
                    }

                    if showOTPFlow {
                        otpFlowCard
                    } else {
                        authCard
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    // Demo accounts section
                    demoAccountsSection

                    // OTP fallback link
                    if !showOTPFlow {
                        Button {
                            showOTPFlow = true
                            errorMessage = nil
                        } label: {
                            Text("Sign in with email code instead")
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textSecondary)
                        }
                    } else {
                        Button {
                            showOTPFlow = false
                            isAwaitingCode = false
                            otpCode = ""
                            errorMessage = nil
                        } label: {
                            Text("Back to email + password")
                                .font(.caption)
                                .foregroundColor(NerdyTheme.textSecondary)
                        }
                    }

                    Spacer().frame(height: 40)
                }
                .padding()
            }
        }
        .disabled(authService.isLoading)
        .overlay {
            if authService.isLoading {
                ProgressView()
                    .tint(NerdyTheme.cyan)
                    .scaleEffect(1.2)
            }
        }
    }

    // MARK: - Auth Card (Sign In / Sign Up)

    private var authCard: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                // Toggle between Sign In and Sign Up
                HStack {
                    Button {
                        isSignUp = false
                        errorMessage = nil
                    } label: {
                        Text("Sign In")
                            .font(.headline)
                            .foregroundColor(isSignUp ? NerdyTheme.textMuted : NerdyTheme.textPrimary)
                    }

                    Text("/")
                        .foregroundColor(NerdyTheme.textMuted)

                    Button {
                        isSignUp = true
                        errorMessage = nil
                    } label: {
                        Text("Sign Up")
                            .font(.headline)
                            .foregroundColor(isSignUp ? NerdyTheme.textPrimary : NerdyTheme.textMuted)
                    }

                    Spacer()
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)
                    TextField("tutor@example.com", text: $email)
                        .textFieldStyle(NerdyTextFieldStyle())
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        #endif
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Password")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)
                    SecureField("Password", text: $password)
                        .textFieldStyle(NerdyTextFieldStyle())
                }

                if isSignUp {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Confirm Password")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        SecureField("Confirm password", text: $confirmPassword)
                            .textFieldStyle(NerdyTextFieldStyle())
                    }
                }

                // Role Picker
                VStack(alignment: .leading, spacing: 8) {
                    Text("I am a...")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)
                    Picker("Role", selection: $selectedRole) {
                        Text("Student").tag(UserRole.student)
                        Text("Tutor").tag(UserRole.tutor)
                    }
                    .pickerStyle(.segmented)
                    .colorMultiply(NerdyTheme.cyan)
                }

                NerdyButton(isSignUp ? "Create Account" : "Sign In",
                            icon: isSignUp ? "person.badge.plus" : "arrow.right.circle.fill") {
                    isSignUp ? performSignUp() : performSignIn()
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: - OTP Flow

    private var otpFlowCard: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                Text(isAwaitingCode ? "Enter Code" : "Sign In with Code")
                    .font(.headline)
                    .foregroundColor(NerdyTheme.textPrimary)

                if isAwaitingCode {
                    Text("Check your email for a 6-digit code.")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Code")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        TextField("000000", text: $otpCode)
                            .textFieldStyle(NerdyTextFieldStyle())
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            #endif
                    }

                    // Role Picker
                    VStack(alignment: .leading, spacing: 8) {
                        Text("I am a...")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        Picker("Role", selection: $selectedRole) {
                            Text("Student").tag(UserRole.student)
                            Text("Tutor").tag(UserRole.tutor)
                        }
                        .pickerStyle(.segmented)
                        .colorMultiply(NerdyTheme.cyan)
                    }

                    NerdyButton("Verify", icon: "checkmark.shield.fill") {
                        verifyCode()
                    }

                    Button {
                        isAwaitingCode = false
                        otpCode = ""
                        errorMessage = nil
                    } label: {
                        Text("Use a different email")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                    }
                } else {
                    Text("Enter your email to receive a sign-in code.")
                        .font(.caption)
                        .foregroundColor(NerdyTheme.textSecondary)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email")
                            .font(.caption)
                            .foregroundColor(NerdyTheme.textSecondary)
                        TextField("tutor@example.com", text: $email)
                            .textFieldStyle(NerdyTextFieldStyle())
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            #endif
                    }

                    NerdyButton("Send Code", icon: "envelope.fill") {
                        sendCode()
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Demo Accounts Section

    private struct DemoAccount: Identifiable {
        let id: String
        let name: String
        let email: String
        let role: UserRole

        init(name: String, email: String, role: UserRole) {
            self.id = email
            self.name = name
            self.email = email
            self.role = role
        }
    }

    private static let demoTutors: [DemoAccount] = [
        DemoAccount(name: "Kim (Tutor)", email: "demo@livesesh.app", role: .tutor),
        DemoAccount(name: "Nick (Tutor)", email: "tutor2@livesesh.app", role: .tutor),
    ]

    private static let demoStudents: [DemoAccount] = [
        DemoAccount(name: "Sarah Chen", email: "demo-student@livesesh.app", role: .student),
        DemoAccount(name: "Alex Rivera", email: "student-alex@livesesh.app", role: .student),
        DemoAccount(name: "Jordan Patel", email: "student-jordan@livesesh.app", role: .student),
        DemoAccount(name: "Casey Kim", email: "student-casey@livesesh.app", role: .student),
        DemoAccount(name: "Morgan Davis", email: "student-morgan@livesesh.app", role: .student),
    ]

    private var demoAccountsSection: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Quick Demo Login", systemImage: "play.circle.fill")
                    .font(.headline)
                    .foregroundColor(NerdyTheme.textPrimary)

                Text("Select a name to sign in instantly.")
                    .font(.caption2)
                    .foregroundColor(NerdyTheme.textMuted)

                // Tutor picker
                demoDropdown(
                    label: "TUTOR",
                    accounts: Self.demoTutors,
                    accentColor: NerdyTheme.cyan
                )

                // Student picker
                demoDropdown(
                    label: "STUDENT",
                    accounts: Self.demoStudents,
                    accentColor: NerdyTheme.magenta
                )
            }
        }
        .padding(.horizontal)
    }

    private func demoDropdown(label: String, accounts: [DemoAccount], accentColor: Color) -> some View {
        Menu {
            ForEach(accounts) { account in
                Button(account.name) {
                    demoLogin(email: account.email, role: account.role)
                }
            }
        } label: {
            HStack {
                Text(label)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundColor(accentColor)
                Spacer()
                Text("Choose...")
                    .font(.caption)
                    .foregroundColor(NerdyTheme.textSecondary)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundColor(NerdyTheme.textSecondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                    .fill(accentColor.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusSmall)
                            .stroke(accentColor.opacity(0.3), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Actions

    private func performSignIn() {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Please enter your password."
            return
        }
        errorMessage = nil
        Task {
            do {
                try await authService.signIn(email: trimmedEmail, password: password)
                authService.selectedRole = selectedRole
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func performSignUp() {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Please enter a password."
            return
        }
        guard password == confirmPassword else {
            errorMessage = "Passwords do not match."
            return
        }
        errorMessage = nil
        Task {
            do {
                try await authService.signUp(email: trimmedEmail, password: password)
                authService.selectedRole = selectedRole
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func demoLogin(email: String, role: UserRole) {
        errorMessage = nil
        Task {
            do {
                try await authService.signIn(email: email, password: "DemoPass123!")
                authService.selectedRole = role
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func sendCode() {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        errorMessage = nil
        Task {
            do {
                try await authService.sendOTP(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
                isAwaitingCode = true
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func verifyCode() {
        guard !otpCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Please enter the code from your email."
            return
        }
        errorMessage = nil
        Task {
            do {
                try await authService.verifyOTP(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    token: otpCode.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                authService.selectedRole = selectedRole
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
