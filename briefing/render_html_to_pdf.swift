import Foundation
import AppKit
import CoreText

enum RenderError: Error {
    case usage
    case cannotCreateAttributedString
    case cannotCreateContext
    case emptyPage
}

func buildAttributedString(from htmlURL: URL) throws -> NSAttributedString {
    let data = try Data(contentsOf: htmlURL)
    let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
        .documentType: NSAttributedString.DocumentType.html,
        .characterEncoding: String.Encoding.utf8.rawValue
    ]

    guard let attributed = try NSMutableAttributedString(
        data: data,
        options: options,
        documentAttributes: nil
    ) as NSMutableAttributedString? else {
        throw RenderError.cannotCreateAttributedString
    }

    // Normalize paragraph spacing slightly because HTML import can be tight in PDF output.
    attributed.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: attributed.length)) { value, range, _ in
        let style = (value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
        if style.paragraphSpacing == 0 {
            style.paragraphSpacing = 3
        }
        attributed.addAttribute(.paragraphStyle, value: style, range: range)
    }

    return attributed
}

func footerAttributes() -> [NSAttributedString.Key: Any] {
    [
        .font: NSFont.systemFont(ofSize: 9),
        .foregroundColor: NSColor(calibratedWhite: 0.45, alpha: 1.0)
    ]
}

func drawPageNumber(_ pageNumber: Int, in context: CGContext, pageRect: CGRect) {
    let footer = NSString(string: "Page \(pageNumber)")
    let attributes = footerAttributes()
    let size = footer.size(withAttributes: attributes)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    footer.draw(
        at: NSPoint(
            x: (pageRect.width - size.width) / 2,
            y: 18
        ),
        withAttributes: attributes
    )
    NSGraphicsContext.restoreGraphicsState()
}

func renderPDF(inputHTML: URL, outputPDF: URL) throws {
    let attributed = try buildAttributedString(from: inputHTML)
    let framesetter = CTFramesetterCreateWithAttributedString(attributed as CFAttributedString)

    var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
    guard let consumer = CGDataConsumer(url: outputPDF as CFURL),
          let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
        throw RenderError.cannotCreateContext
    }

    let metadata: [CFString: Any] = [
        kCGPDFContextTitle: "Nerdy / Varsity Tutors Briefing",
        kCGPDFContextCreator: "Codex"
    ]

    let textRect = CGRect(x: 52, y: 44, width: mediaBox.width - 104, height: mediaBox.height - 98)
    var currentRange = CFRange(location: 0, length: 0)
    var pageNumber = 1

    while currentRange.location < attributed.length {
        context.beginPDFPage(metadata as CFDictionary)
        context.saveGState()
        context.translateBy(x: 0, y: mediaBox.height)
        context.scaleBy(x: 1, y: -1)

        let path = CGMutablePath()
        path.addRect(textRect)

        let frame = CTFramesetterCreateFrame(framesetter, currentRange, path, nil)
        CTFrameDraw(frame, context)

        let visibleRange = CTFrameGetVisibleStringRange(frame)
        if visibleRange.length == 0 {
            throw RenderError.emptyPage
        }

        context.restoreGState()
        drawPageNumber(pageNumber, in: context, pageRect: mediaBox)
        context.endPDFPage()

        currentRange.location += visibleRange.length
        currentRange.length = 0
        pageNumber += 1
    }

    context.closePDF()
}

do {
    guard CommandLine.arguments.count == 3 else {
        throw RenderError.usage
    }

    let inputHTML = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputPDF = URL(fileURLWithPath: CommandLine.arguments[2])
    try renderPDF(inputHTML: inputHTML, outputPDF: outputPDF)
} catch RenderError.usage {
    fputs("Usage: swift render_html_to_pdf.swift input.html output.pdf\n", stderr)
    exit(1)
} catch {
    fputs("Failed to render PDF: \(error)\n", stderr)
    exit(1)
}
