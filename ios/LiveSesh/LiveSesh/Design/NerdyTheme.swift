import SwiftUI

enum NerdyTheme {
    // MARK: - Primary Colors (warm light theme)
    static let backgroundDark = Color(hex: "F0E8E0")
    static let backgroundCard = Color(hex: "FFFFFF")
    static let backgroundElevated = Color(hex: "FEFAF7")

    static let cyan = Color(hex: "C4402F")
    static let magenta = Color(hex: "C4402F")
    static let purple = Color(hex: "C4402F")
    static let blue = Color(hex: "C4402F")
    static let orange = Color(hex: "E8573A")
    static let yellow = Color(hex: "E8873A")

    static let textPrimary = Color(hex: "1A1A1A")
    static let textSecondary = Color(hex: "5A5A5A")
    static let textMuted = Color(hex: "777777")

    // MARK: - Gradients
    static let gradientAccent = LinearGradient(
        colors: [Color(hex: "C4402F"), Color(hex: "E8573A")],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let gradientLiveAI = LinearGradient(
        colors: [Color(hex: "C4402F"), Color(hex: "E8573A"), Color(hex: "E8873A")],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let backgroundGradient = LinearGradient(
        colors: [Color(hex: "F0E8E0"), Color(hex: "EDE5DF")],
        startPoint: .top,
        endPoint: .bottom
    )

    // MARK: - Nudge Colors
    static let nudgeInfo = Color(hex: "2B86C5")
    static let nudgeSuggestion = Color(hex: "E8873A")
    static let nudgeAlert = Color(hex: "C4402F")
    static let nudgeSuccess = Color(hex: "2D9D5E")

    // MARK: - Engagement Score Colors
    static func engagementColor(for score: Double) -> Color {
        switch score {
        case 0..<0.3: return Color(hex: "C4402F")
        case 0.3..<0.5: return orange
        case 0.5..<0.7: return yellow
        case 0.7..<0.85: return Color(hex: "2D9D5E")
        default: return Color(hex: "10B981")
        }
    }

    // MARK: - Corner Radius
    static let cornerRadiusSmall: CGFloat = 8
    static let cornerRadiusMedium: CGFloat = 12
    static let cornerRadiusLarge: CGFloat = 16
    static let cornerRadiusXL: CGFloat = 24
}

// MARK: - Color Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Reusable Components
struct NerdyCard<Content: View>: View {
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                    .fill(NerdyTheme.backgroundCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                            .stroke(Color.black.opacity(0.06), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 4)
            )
    }
}

struct NerdyButton: View {
    let title: String
    let icon: String?
    let action: () -> Void

    init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon {
                    Image(systemName: icon)
                }
                Text(title)
                    .fontWeight(.semibold)
            }
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusLarge)
                    .fill(NerdyTheme.cyan)
            )
        }
    }
}

struct GlassCard<Content: View>: View {
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: NerdyTheme.cornerRadiusMedium)
                            .stroke(Color.black.opacity(0.08), lineWidth: 1)
                    )
            )
    }
}

struct MetricGauge: View {
    let label: String
    let value: Double
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color.black.opacity(0.08), lineWidth: 6)
                    .frame(width: 60, height: 60)
                Circle()
                    .trim(from: 0, to: value)
                    .stroke(
                        NerdyTheme.engagementColor(for: value),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .frame(width: 60, height: 60)
                    .rotationEffect(.degrees(-90))
                Image(systemName: icon)
                    .foregroundColor(NerdyTheme.engagementColor(for: value))
                    .font(.system(size: 18))
            }
            Text("\(Int(value * 100))%")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(NerdyTheme.textPrimary)
            Text(label)
                .font(.caption)
                .foregroundColor(NerdyTheme.textSecondary)
        }
    }
}
