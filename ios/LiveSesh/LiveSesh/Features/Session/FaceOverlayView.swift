import SwiftUI

struct FaceOverlayView: View {
    let faceDetection: FaceDetectionResult?
    let gaze: GazeEstimation?
    let expression: FacialExpression?
    let viewSize: CGSize

    var body: some View {
        Canvas { context, size in
            guard let detection = faceDetection else { return }

            for face in detection.faces {
                // Convert Vision normalized rect (origin bottom-left) to view coordinates
                let rect = visionRectToView(face.boundingBox, in: size)

                // Draw bounding box
                let boxPath = Path(roundedRect: rect, cornerRadius: 4)
                context.stroke(boxPath, with: .color(NerdyTheme.cyan.opacity(0.8)), lineWidth: 1.5)

                // Draw gaze direction arrow
                if let gaze {
                    let center = CGPoint(x: rect.midX, y: rect.midY)
                    let arrowLength: CGFloat = 30
                    let dx: CGFloat
                    let dy: CGFloat

                    switch gaze.gazeDirection {
                    case .atCamera: dx = 0; dy = 0
                    case .left: dx = -arrowLength; dy = 0
                    case .right: dx = arrowLength; dy = 0
                    case .up: dx = 0; dy = -arrowLength
                    case .down: dx = 0; dy = arrowLength
                    case .away: dx = arrowLength * 0.7; dy = arrowLength * 0.7
                    case .unknown: dx = 0; dy = 0
                    }

                    if dx != 0 || dy != 0 {
                        var arrowPath = Path()
                        arrowPath.move(to: center)
                        arrowPath.addLine(to: CGPoint(x: center.x + dx, y: center.y + dy))
                        context.stroke(arrowPath, with: .color(NerdyTheme.cyan), lineWidth: 2)
                    }
                }

                // Draw expression label below box
                if let expression {
                    let label = expression.dominantExpression.rawValue.capitalized
                    let textPoint = CGPoint(x: rect.midX, y: rect.maxY + 14)
                    context.draw(
                        Text(label)
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundColor(NerdyTheme.cyan),
                        at: textPoint
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func visionRectToView(_ rect: CGRect, in size: CGSize) -> CGRect {
        // Vision coordinates: origin at bottom-left, normalized 0-1
        // SwiftUI coordinates: origin at top-left
        // For front camera (mirrored): x is flipped
        let x = (1 - rect.origin.x - rect.width) * size.width
        let y = (1 - rect.origin.y - rect.height) * size.height
        let w = rect.width * size.width
        let h = rect.height * size.height
        return CGRect(x: x, y: y, width: w, height: h)
    }
}
