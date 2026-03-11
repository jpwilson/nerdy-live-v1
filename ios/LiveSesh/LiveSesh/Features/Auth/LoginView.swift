import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var otpCode = ""
    @State private var isAwaitingCode = false
    @State private var errorMessage: String?

    private var authService: AuthService { appState.authService }

    var body: some View {
        ZStack {
            NerdyTheme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 8) {
                    Text("nerdy")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundStyle(NerdyTheme.gradientLiveAI)

                    Text("Live Session Analysis")
                        .font(.subheadline)
                        .foregroundColor(NerdyTheme.textSecondary)
                }

                if isAwaitingCode {
                    verifyCodeView
                } else {
                    emailEntryView
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                // Demo login for evaluators
                VStack(spacing: 8) {
                    Rectangle()
                        .fill(NerdyTheme.textMuted.opacity(0.3))
                        .frame(height: 1)
                        .padding(.horizontal, 40)

                    Button {
                        demoLogin()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "play.circle.fill")
                            Text("Try Demo")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(NerdyTheme.cyan)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                                .stroke(NerdyTheme.cyan.opacity(0.4), lineWidth: 1)
                        )
                    }
                    .padding(.horizontal)

                    Text("Skip sign-in with a pre-loaded demo account")
                        .font(.caption2)
                        .foregroundColor(NerdyTheme.textMuted)
                }

                Spacer()
                Spacer()
            }
            .padding()
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

    private var emailEntryView: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Sign In")
                    .font(.headline)
                    .foregroundColor(.white)

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
        .padding(.horizontal)
    }

    private var verifyCodeView: some View {
        NerdyCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Enter Code")
                    .font(.headline)
                    .foregroundColor(.white)

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
            }
        }
        .padding(.horizontal)
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

    private func demoLogin() {
        errorMessage = nil
        Task {
            do {
                try await authService.signInDemo()
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
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
