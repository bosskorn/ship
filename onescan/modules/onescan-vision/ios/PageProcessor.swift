import CoreImage
import UIKit

/// Perspective correction → rotate → enhance → filter (spec §13), via Core Image on GPU.
enum OneScanPageProcessor {
  static let workEdge: CGFloat = 3200
  static let maxOutputEdge: CGFloat = 2480

  /// `quad` is normalised TL, TR, BR, BL with a top-left origin.
  static func process(uri: String, quad: [CGPoint]?, filter: String, rotation: Int) throws -> (URL, Int, Int) {
    var image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: workEdge)
    if let q = quad, q.count == 4 { image = warp(image, quad: q) }
    image = rotate(image, degrees: rotation)
    image = OneScanImageIO.scaled(image, maxEdge: maxOutputEdge)
    image = applyFilter(image, filter: filter)
    return try OneScanImageIO.saveJpeg(image, prefix: "page")
  }

  static func warp(_ image: CIImage, quad: [CGPoint]) -> CIImage {
    let e = image.extent
    // Core Image uses a bottom-left origin.
    func pt(_ p: CGPoint) -> CIVector {
      CIVector(x: min(max(p.x, 0), 1) * e.width + e.minX, y: (1 - min(max(p.y, 0), 1)) * e.height + e.minY)
    }
    let out = image.applyingFilter("CIPerspectiveCorrection", parameters: [
      "inputTopLeft": pt(quad[0]),
      "inputTopRight": pt(quad[1]),
      "inputBottomRight": pt(quad[2]),
      "inputBottomLeft": pt(quad[3]),
      "inputCrop": true,
    ])
    return out.transformed(by: CGAffineTransform(translationX: -out.extent.minX, y: -out.extent.minY))
  }

  static func rotate(_ image: CIImage, degrees: Int) -> CIImage {
    switch ((degrees % 360) + 360) % 360 {
    case 90: return image.oriented(.right)
    case 180: return image.oriented(.down)
    case 270: return image.oriented(.left)
    default: return image
    }
  }

  /// out = min(source / paper × 0.96, 1): explicit so the direction is unambiguous.
  private static let divideKernel: CIColorKernel? = CIColorKernel(source: """
    kernel vec4 onescanDivide(__sample s, __sample p) {
      vec3 d = s.rgb / max(p.rgb, vec3(0.08));
      return vec4(min(d * 0.96, vec3(1.0)), s.a);
    }
    """)

  /// Divide by a heavily blurred copy to flatten shadows and uneven lighting.
  static func normalizeIllumination(_ image: CIImage, strength: CGFloat) -> CIImage {
    let e = image.extent
    let radius = max(e.width, e.height) / 30
    // Max-like background estimate: morphology removes thin dark text before blurring.
    let paper = image
      .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: min(radius / 3, 40)])
      .clampedToExtent()
      .applyingGaussianBlur(sigma: Double(radius))
      .cropped(to: e)
    guard let kernel = divideKernel,
          let divided = kernel.apply(extent: e, arguments: [image, paper]) else { return image }
    if strength >= 1 { return divided }
    return divided.applyingFilter("CIDissolveTransition", parameters: [kCIInputTargetImageKey: image, "inputTime": 1 - strength])
  }

  static func applyFilter(_ image: CIImage, filter: String) -> CIImage {
    switch filter {
    case "original":
      return image
    case "auto":
      return normalizeIllumination(image, strength: 0.7)
        .applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.08, kCIInputSaturationKey: 1.05])
    case "document":
      return normalizeIllumination(image, strength: 1)
        .applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.3, kCIInputSaturationKey: 0.8, kCIInputBrightnessKey: 0.02])
        .applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": 0.02, "inputSharpness": 0.5])
    case "color":
      return image.applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.12, kCIInputSaturationKey: 1.35])
    case "gray":
      return normalizeIllumination(image, strength: 0.6)
        .applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.12, kCIInputSaturationKey: 0])
    case "bw":
      return normalizeIllumination(image, strength: 1)
        .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0])
        .applyingFilter("CIColorThresholdOtsu")
    default:
      return image
    }
  }
}
