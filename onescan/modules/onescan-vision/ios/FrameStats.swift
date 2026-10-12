import Foundation

/// Per-frame capture-quality numbers, computed on the camera's frame queue so the JS
/// thread never walks frame pixels. Mirrors `sharpnessOf` in quadDetector.ts and
/// android FrameStats.kt exactly.
enum OneScanFrameStats {
  /// Mean luminance 0..1.
  static func brightness(_ y: [UInt8]) -> Double {
    if y.isEmpty { return 0 }
    var sum = 0
    for b in y { sum += Int(b) }
    return Double(sum) / Double(y.count) / 255
  }

  /// Variance of the Laplacian mapped to 0..1 (calibrated on ~180×240 frames).
  static func sharpness(_ y: [UInt8], width w: Int, height h: Int) -> Double {
    var n = 0
    var mean = 0.0
    var m2 = 0.0
    if h > 2 && w > 2 {
      for yy in 1..<(h - 1) {
        for x in 1..<(w - 1) {
          let i = yy * w + x
          let lap = Double(4 * Int(y[i]) - Int(y[i - 1]) - Int(y[i + 1]) - Int(y[i - w]) - Int(y[i + w]))
          n += 1
          let d = lap - mean
          mean += d / Double(n)
          m2 += d * (lap - mean)
        }
      }
    }
    let variance = n > 1 ? m2 / Double(n - 1) : 0
    return min(1, variance / 2000)
  }
}
