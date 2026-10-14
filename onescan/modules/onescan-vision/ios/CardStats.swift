import Foundation

/// Statistics for the "card" filter, computed on a small sRGB copy (mirrors the first
/// stages of `CardLook.kt`): white-balance gains from the card's light low-chroma areas,
/// the dilated + smoothed illumination grid, its target level and the levels range.
/// Pure Swift so it is testable without Core Image; the per-pixel work runs as a
/// Core Image kernel in `OneScanPageProcessor.cardLook`.
struct OneScanCardStats {
  let wb: [Float]
  /// Row-major, top row first; 0…255 luminance of the "paper" per cell.
  let grid: [Float]
  let gw: Int
  let gh: Int
  let target: Float
  let lo: Float
  let hi: Float

  private static func lum(_ r: Float, _ g: Float, _ b: Float) -> Float { 0.299 * r + 0.587 * g + 0.114 * b }

  private static func percentile(_ hist: [Int], _ total: Int, _ q: Double, scale: Float = 1) -> Float {
    var target = Int(Double(total) * q)
    for (i, c) in hist.enumerated() {
      target -= c
      if target <= 0 { return Float(i) / scale }
    }
    return Float(hist.count - 1) / scale
  }

  /// `rgba`: width × height × 4 bytes (sRGB, top-left origin).
  static func compute(rgba: [UInt8], width w: Int, height h: Int) -> OneScanCardStats? {
    let n = w * h
    guard n > 0, rgba.count >= n * 4 else { return nil }
    func px(_ i: Int) -> (Int, Int, Int) { (Int(rgba[i * 4]), Int(rgba[i * 4 + 1]), Int(rgba[i * 4 + 2])) }

    // White balance reference: bright (≥ 80th pct), low-chroma (≤ 60th pct of those) pixels.
    var lHist = [Int](repeating: 0, count: 256)
    for i in 0..<n { let (r, g, b) = px(i); lHist[(r * 77 + g * 150 + b * 29) >> 8] += 1 }
    let lBright = Int(percentile(lHist, n, 0.80))
    var chHist = [Int](repeating: 0, count: 256)
    var brightCount = 0
    for i in 0..<n {
      let (r, g, b) = px(i)
      if (r * 77 + g * 150 + b * 29) >> 8 >= lBright { chHist[max(r, g, b) - min(r, g, b)] += 1; brightCount += 1 }
    }
    let chMax = Int(percentile(chHist, brightCount, 0.60))
    var s = [0, 0, 0], cnt = 0
    for i in 0..<n {
      let (r, g, b) = px(i)
      if (r * 77 + g * 150 + b * 29) >> 8 >= lBright, max(r, g, b) - min(r, g, b) <= chMax {
        s[0] += r; s[1] += g; s[2] += b; cnt += 1
      }
    }
    var ref: [Float]
    if cnt > 100 {
      ref = s.map { Float($0) / Float(cnt) }
    } else {
      ref = (0..<3).map { ch in
        var hst = [Int](repeating: 0, count: 256)
        for i in 0..<n { hst[Int(rgba[i * 4 + ch])] += 1 }
        return percentile(hst, n, 0.95)
      }
    }
    let refL = lum(ref[0], ref[1], ref[2])
    let wb = (0..<3).map { k in 1 + (min(max(refL / max(ref[k], 1), 0.75), 1.4) - 1) * 0.85 }

    // Illumination grid: 90th pct of balanced luminance per block, dilated, smoothed ×2.
    let block = max(8, max(w, h) / 12)
    let gw = (w + block - 1) / block, gh = (h + block - 1) / block
    var grid = [Float](repeating: 0, count: gw * gh)
    for gy in 0..<gh {
      for gx in 0..<gw {
        var bh = [Int](repeating: 0, count: 256)
        var m = 0
        var y = gy * block
        while y < min(h, (gy + 1) * block) {
          var x = gx * block
          while x < min(w, (gx + 1) * block) {
            let (r, g, b) = px(y * w + x)
            let l = lum(Float(r) * wb[0], Float(g) * wb[1], Float(b) * wb[2])
            bh[min(255, max(0, Int(l.rounded())))] += 1
            m += 1
            x += 2
          }
          y += 2
        }
        grid[gy * gw + gx] = percentile(bh, m, 0.90)
      }
    }
    func at(_ g: [Float], _ x: Int, _ y: Int) -> Float { g[min(gh - 1, max(0, y)) * gw + min(gw - 1, max(0, x))] }
    grid = (0..<(gw * gh)).map { i in
      var m = grid[i]
      for dy in -1...1 { for dx in -1...1 { m = max(m, at(grid, i % gw + dx, i / gw + dy)) } }
      return m
    }
    for _ in 0..<2 {
      let src = grid
      grid = (0..<(gw * gh)).map { i in
        var t: Float = 0
        for dy in -1...1 { for dx in -1...1 { t += at(src, i % gw + dx, i / gw + dy) } }
        return t / 9
      }
    }
    let sorted = grid.sorted()
    let target = sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.9))]

    // Levels range after white balance and lighting gain (estimated on this copy).
    var hist = [Int](repeating: 0, count: 1024)
    for y in 0..<h {
      let fy = min(Float(gh - 1), max(0, (Float(y) + 0.5) / Float(block) - 0.5))
      let y0 = Int(fy), y1 = min(gh - 1, y0 + 1), ty = fy - Float(y0)
      for x in 0..<w {
        let fx = min(Float(gw - 1), max(0, (Float(x) + 0.5) / Float(block) - 0.5))
        let x0 = Int(fx), x1 = min(gw - 1, x0 + 1), tx = fx - Float(x0)
        let illum = (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) +
          (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty
        let gain = min(max(target / max(illum, 1), 0.85), 1.8)
        let (r, g, b) = px(y * w + x)
        let l = lum(Float(r) * wb[0], Float(g) * wb[1], Float(b) * wb[2]) * gain
        hist[min(1023, max(0, Int((l * 2).rounded())))] += 1
      }
    }
    let lo = min(percentile(hist, n, 0.005, scale: 2), 60)
    let hi = max(percentile(hist, n, 0.995, scale: 2), 180)
    return OneScanCardStats(wb: wb, grid: grid, gw: gw, gh: gh, target: target, lo: lo, hi: hi)
  }
}
