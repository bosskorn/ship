import CoreImage
import ImageIO
import UIKit

/// File/image helpers. Output always goes to the app's caches directory.
enum OneScanImageIO {
  static let ciContext = CIContext(options: [.cacheIntermediates: false])

  static func url(from uri: String) -> URL {
    if let u = URL(string: uri), u.scheme != nil { return u }
    return URL(fileURLWithPath: uri)
  }

  static func outputDir() -> URL {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("onescan", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  /// Loads with EXIF orientation applied, downscaled so the long edge ≤ maxEdge.
  static func loadUpright(_ url: URL, maxEdge: CGFloat) throws -> CIImage {
    guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      throw NSError(domain: "OneScanVision", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unreadable image"])
    }
    return scaled(image, maxEdge: maxEdge)
  }

  static func scaled(_ image: CIImage, maxEdge: CGFloat) -> CIImage {
    let e = image.extent
    let long = max(e.width, e.height)
    guard long > maxEdge else { return image.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY)) }
    let s = maxEdge / long
    let out = image.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: s, kCIInputAspectRatioKey: 1.0])
    return out.transformed(by: CGAffineTransform(translationX: -out.extent.minX, y: -out.extent.minY))
  }

  static func saveJpeg(_ image: CIImage, prefix: String, quality: CGFloat = 0.88) throws -> (URL, Int, Int) {
    let url = outputDir().appendingPathComponent("\(prefix)-\(UUID().uuidString).jpg")
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let opts: [CIImageRepresentationOption: Any] = [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: quality]
    try ciContext.writeJPEGRepresentation(of: image, to: url, colorSpace: colorSpace, options: opts)
    return (url, Int(image.extent.width.rounded()), Int(image.extent.height.rounded()))
  }

  static func cgImage(_ image: CIImage) -> CGImage? {
    ciContext.createCGImage(image, from: image.extent)
  }

  /// Full-range BT.601 Y, Cb, Cr planes (row-major, top-left origin).
  static func ycbcr(_ image: CIImage) -> (Int, Int, Data, Data, Data)? {
    let w = Int(image.extent.width.rounded())
    let h = Int(image.extent.height.rounded())
    guard w > 0, h > 0, let cg = cgImage(image) else { return nil }
    var rgba = [UInt8](repeating: 0, count: w * h * 4)
    let drawn: Bool = rgba.withUnsafeMutableBytes { raw in
      guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard drawn else { return nil }
    var y = Data(count: w * h)
    var cb = Data(count: w * h)
    var cr = Data(count: w * h)
    y.withUnsafeMutableBytes { yr in
      cb.withUnsafeMutableBytes { cbr in
        cr.withUnsafeMutableBytes { crr in
          let yp = yr.bindMemory(to: UInt8.self)
          let cbp = cbr.bindMemory(to: UInt8.self)
          let crp = crr.bindMemory(to: UInt8.self)
          for i in 0..<(w * h) {
            let r = Int(rgba[i * 4])
            let g = Int(rgba[i * 4 + 1])
            let b = Int(rgba[i * 4 + 2])
            yp[i] = UInt8((r * 77 + g * 150 + b * 29) >> 8)
            cbp[i] = UInt8(min(255, max(0, 128 + ((-43 * r - 85 * g + 128 * b) >> 8))))
            crp[i] = UInt8(min(255, max(0, 128 + ((128 * r - 107 * g - 21 * b) >> 8))))
          }
        }
      }
    }
    return (w, h, y, cb, cr)
  }

  /// 8-bit luminance buffer (row-major, top-left origin).
  static func luminance(_ image: CIImage) -> (Int, Int, Data)? {
    let w = Int(image.extent.width.rounded())
    let h = Int(image.extent.height.rounded())
    guard w > 0, h > 0 else { return nil }
    var data = Data(count: w * h)
    let ok: Bool = data.withUnsafeMutableBytes { raw in
      guard let base = raw.baseAddress,
            let ctx = CGContext(data: base, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue),
            let cg = cgImage(image) else { return false }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    return ok ? (w, h, data) : nil
  }
}
