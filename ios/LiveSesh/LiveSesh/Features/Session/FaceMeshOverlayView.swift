import SwiftUI

struct FaceMeshOverlayView: View {
    let faceDetection: FaceDetectionResult?
    let viewSize: CGSize

    var body: some View {
        Canvas { context, size in
            guard let detection = faceDetection else { return }

            for face in detection.faces {
                guard let landmarks = face.landmarks else { continue }
                let box = face.boundingBox

                // Draw each landmark region as connected path
                drawRegion(landmarks.leftEyePoints, in: context, box: box, size: size, closed: true)
                drawRegion(landmarks.rightEyePoints, in: context, box: box, size: size, closed: true)
                drawRegion(landmarks.leftEyebrowPoints, in: context, box: box, size: size, closed: false)
                drawRegion(landmarks.rightEyebrowPoints, in: context, box: box, size: size, closed: false)
                drawRegion(landmarks.nosePoints, in: context, box: box, size: size, closed: false)
                drawRegion(landmarks.noseCrestPoints, in: context, box: box, size: size, closed: false)
                drawRegion(landmarks.innerLipsPoints, in: context, box: box, size: size, closed: true)
                drawRegion(landmarks.outerLipsPoints, in: context, box: box, size: size, closed: true)
                drawRegion(landmarks.faceContour, in: context, box: box, size: size, closed: false)
                drawRegion(landmarks.medianLinePoints, in: context, box: box, size: size, closed: false)
            }
        }
        .allowsHitTesting(false)
    }

    private func drawRegion(_ points: [CGPoint], in context: GraphicsContext, box: CGRect, size: CGSize, closed: Bool) {
        guard points.count >= 2 else { return }

        let viewPoints = points.map { pt -> CGPoint in
            landmarkToView(pt, boundingBox: box, in: size)
        }

        // Draw connected path
        var path = Path()
        path.move(to: viewPoints[0])
        for point in viewPoints.dropFirst() {
            path.addLine(to: point)
        }
        if closed {
            path.closeSubpath()
        }

        context.stroke(path, with: .color(NerdyTheme.cyan.opacity(0.6)), lineWidth: 1)

        // Draw dots at each point
        for point in viewPoints {
            let dotRect = CGRect(x: point.x - 1.5, y: point.y - 1.5, width: 3, height: 3)
            context.fill(Path(ellipseIn: dotRect), with: .color(NerdyTheme.cyan.opacity(0.8)))
        }
    }

    private func landmarkToView(_ point: CGPoint, boundingBox box: CGRect, in size: CGSize) -> CGPoint {
        // Landmark points are normalized within the face bounding box (Vision coordinates)
        // Convert to full-image normalized coordinates first
        let imageX = box.origin.x + point.x * box.width
        let imageY = box.origin.y + point.y * box.height

        // Vision to SwiftUI (flip Y, flip X for front camera mirror)
        let viewX = (1 - imageX) * size.width
        let viewY = (1 - imageY) * size.height
        return CGPoint(x: viewX, y: viewY)
    }
}
