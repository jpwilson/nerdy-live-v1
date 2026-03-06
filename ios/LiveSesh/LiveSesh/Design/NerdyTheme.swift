import SwiftUI

enum NerdyTheme {
    // MARK: - Primary Colors (from nerdy.com)
    static let backgroundDark = Color(hex: "0D0E1A")
    static let backgroundCard = Color(hex: "1A1B2E")
    static let backgroundElevated = Color(hex: "252640")

    static let cyan = Color(hex: "00D4AA")
    static let magenta = Color(hex: "FF3CAC")
    static let purple = Color(hex: "784BA0")
    static let blue = Color(hex: "2B86C5")
    static let orange = Color(hex: "FF6B35")
    static let yellow = Color(hex: "FFD700")

    static let textPrimary = Color.white
    static let textSecondary = Color(hex: "8B8CA0")
    static let textMuted = Color(hex: "5A5B6E")

    // MARK: - Gradients
    static let gradientAccent = LinearGradient(
        colors: [cyan, magenta, purple],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let gradientLiveAI = LinearGradient(
        colors: [cyan, blue, purple, magenta],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let backgroundGradient = LinearGradient(
        colors: [backgroundDark, Color(hex: "121328")],
        startPoint: .top,
        endPoint: .bottom
    )

    // MARK: - Nudge Colors
    static let nudgeInfo = blue
    static let nudgeSuggestion = Color(hex: "F59E0B")
    static let nudgeAlert = Color(hex: "EF4444")
    static let nudgeSuccess = cyan

    // MARK: - Engagement Score Colors
    static func engagementColor(for score: Double) -> Color {
        switch score {
        case 0..<0.3: return .red
        case 0.3..<0.5: return orange
        case 0.5..<0.7: return yellow
        case 0.7..<0.85: return cyan
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
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
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
                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
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
                    .stroke(Color.white.opacity(0.1), lineWidth: 6)
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
                .foregroundColor(.white)
            Text(label)
                .font(.caption)
                .foregroundColor(NerdyTheme.textSecondary)
        }
    }
}
