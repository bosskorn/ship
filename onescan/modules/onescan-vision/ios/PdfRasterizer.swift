import PDFKit
import UIKit

/// Renders imported PDF pages to JPEGs one at a time.
enum OneScanPdfRasterizer {
  static func render(uri: String, maxWidth: CGFloat) throws -> [[String: Any]] {
    guard let doc = PDFDocument(url: OneScanImageIO.url(from: uri)) else {
      throw NSError(domain: "OneScanVision", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unreadable PDF"])
    }
    var out: [[String: Any]] = []
    for i in 0..<doc.pageCount {
      try autoreleasepool {
        guard let page = doc.page(at: i) else { return }
        let bounds = page.bounds(for: .mediaBox)
        let scale = maxWidth / max(bounds.width, 1)
        let size = CGSize(width: maxWidth, height: (bounds.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let img = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
          UIColor.white.setFill()
          ctx.fill(CGRect(origin: .zero, size: size))
          ctx.cgContext.translateBy(x: 0, y: size.height)
          ctx.cgContext.scaleBy(x: scale, y: -scale)
          ctx.cgContext.translateBy(x: -bounds.minX, y: -bounds.minY)
          page.draw(with: .mediaBox, to: ctx.cgContext)
        }
        let url = OneScanImageIO.outputDir().appendingPathComponent("pdfpage-\(UUID().uuidString).jpg")
        guard let data = img.jpegData(compressionQuality: 0.85) else { return }
        try data.write(to: url)
        out.append(["uri": url.absoluteString, "width": Int(size.width), "height": Int(size.height)])
      }
    }
    return out
  }

  static func redact(uri: String, boxes: [[String: Double]]) throws -> URL {
    let image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: 4096)
    guard let cg = OneScanImageIO.cgImage(image) else {
      throw NSError(domain: "OneScanVision", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unreadable image"])
    }
    let size = CGSize(width: cg.width, height: cg.height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let pad = size.height * 0.003
    let out = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
      UIImage(cgImage: cg).draw(in: CGRect(origin: .zero, size: size))
      UIColor.black.setFill()
      for b in boxes {
        let r = CGRect(x: (b["x"] ?? 0) * size.width - pad, y: (b["y"] ?? 0) * size.height - pad,
                       width: (b["width"] ?? 0) * size.width + 2 * pad, height: (b["height"] ?? 0) * size.height + 2 * pad)
        ctx.fill(r)
      }
    }
    let url = OneScanImageIO.outputDir().appendingPathComponent("redacted-\(UUID().uuidString).jpg")
    guard let data = out.jpegData(compressionQuality: 0.9) else {
      throw NSError(domain: "OneScanVision", code: 4, userInfo: [NSLocalizedDescriptionKey: "Encode failed"])
    }
    try data.write(to: url)
    return url
  }
}
