import Foundation

/// DocSeg — on-device document segmentation. Port of the reference runtime in
/// `src/core/document-engine/capture/docSeg.ts` (keep in sync). Y/Cb/Cr planes →
/// 64×64 page probabilities (0..255). Pure Swift, no ML runtime dependency.
final class DocSeg {
  static let input = 128
  static let maskSize = 64

  private struct T {
    let c: Int, h: Int, w: Int
    var d: [Float]
  }

  /// Blocks per stage (encoder e1..e4, decoder d3..d1) and arrays in forward order.
  struct Weights {
    let blocks: [Int]
    let arrays: [[Float]]
  }

  private let blocks: [Int]
  private let w: [[Float]]
  private var i = 0
  private let lock = NSLock()

  init(weights: Weights) {
    blocks = weights.blocks
    w = weights.arrays
  }

  private static var cached: DocSeg?
  private static let cacheLock = NSLock()

  /// Lazily loads `docseg.bin` from the app bundle; nil if missing or corrupt.
  static func shared() -> DocSeg? {
    cacheLock.lock(); defer { cacheLock.unlock() }
    if let c = cached { return c }
    let url = Bundle.main.url(forResource: "docseg", withExtension: "bin")
      ?? Bundle(for: DocSeg.self).url(forResource: "docseg", withExtension: "bin")
    guard let url, let data = try? Data(contentsOf: url), let weights = parse(data) else { return nil }
    cached = DocSeg(weights: weights)
    return cached
  }

  static func parse(_ data: Data) -> Weights? {
    let bytes = [UInt8](data)
    guard bytes.count >= 36, String(bytes: bytes[0..<4], encoding: .ascii) == "DSG2" else { return nil }
    func u32(_ o: Int) -> Int {
      Int(UInt32(bytes[o]) | UInt32(bytes[o + 1]) << 8 | UInt32(bytes[o + 2]) << 16 | UInt32(bytes[o + 3]) << 24)
    }
    let blocks = (0..<7).map { u32(4 + $0 * 4) }
    let count = u32(32)
    // stem + 2 convs per block + decoder 1×1s, each weight + bias, + context + head.
    let convs = 1 + 2 * blocks.reduce(0, +) + 3
    guard blocks.enumerated().allSatisfy({ $0.element >= ($0.offset < 4 ? 1 : 0) && $0.element <= 16 }),
          count == convs * 2 + 4 else { return nil }
    var off = 36
    var out: [[Float]] = []
    for _ in 0..<count {
      guard off + 4 <= bytes.count else { return nil }
      let n = u32(off); off += 4
      guard off + n * 4 <= bytes.count else { return nil }
      var a = [Float](repeating: 0, count: n)
      for k in 0..<n { a[k] = Float(bitPattern: UInt32(u32(off + k * 4))) }
      off += n * 4
      out.append(a)
    }
    return Weights(blocks: blocks, arrays: out)
  }

  /// 64×64 probabilities scaled to 0..255 (row-major).
  func mask(y: [UInt8], cb: [UInt8]?, cr: [UInt8]?, width: Int, height: Int) -> Data {
    let l = logits(DocSeg.makeInput(y: y, cb: cb, cr: cr, width: width, height: height))
    var out = Data(count: l.count)
    for k in 0..<l.count { out[k] = UInt8((255.0 / (1.0 + exp(-Double(l[k])))).rounded()) }
    return out
  }

  static func makeInput(y: [UInt8], cb: [UInt8]?, cr: [UInt8]?, width: Int, height: Int) -> [Float] {
    let s = input
    var out = [Float](repeating: 0, count: 3 * s * s)
    resize(y, width, height, &out, 0)
    if let cb, let cr {
      resize(cb, width, height, &out, s * s)
      resize(cr, width, height, &out, 2 * s * s)
    }
    return out
  }

  private static func resize(_ src: [UInt8], _ w: Int, _ h: Int, _ out: inout [Float], _ off: Int) {
    let s = input
    let sx = Double(w) / Double(s), sy = Double(h) / Double(s)
    for y in 0..<s {
      let fy = min(Double(h - 1), max(0, (Double(y) + 0.5) * sy - 0.5))
      let y0 = Int(fy.rounded(.down)), y1 = min(h - 1, y0 + 1)
      let ty = fy - Double(y0)
      for x in 0..<s {
        let fx = min(Double(w - 1), max(0, (Double(x) + 0.5) * sx - 0.5))
        let x0 = Int(fx.rounded(.down)), x1 = min(w - 1, x0 + 1)
        let tx = fx - Double(x0)
        let top = Double(src[y0 * w + x0]) * (1 - tx) + Double(src[y0 * w + x1]) * tx
        let bot = Double(src[y1 * w + x0]) * (1 - tx) + Double(src[y1 * w + x1]) * tx
        // JS Math.round: half rounds up.
        out[off + y * s + x] = Float(Int((top * (1 - ty) + bot * ty + 0.5).rounded(.down)) - 128) / 128
      }
    }
  }

  private func next() -> [Float] { defer { i += 1 }; return w[i] }

  func logits(_ input: [Float]) -> [Float] {
    lock.lock(); defer { lock.unlock() }
    i = 0
    let s = DocSeg.input
    let stemW = next(), stemB = next()
    // Channel widths come from the weight file (bias length = output channels).
    let x = conv3x3(T(c: 3, h: s, w: s, d: input), stemW, stemB, stemB.count, 2)
    let b = blocks
    let s1 = stage(x, b[0], 1)
    let s2 = stage(s1, b[1], 2)
    let s3 = stage(s2, b[2], 2)
    var s4 = stage(s3, b[3], 2)
    let cw = next(), cb = next()
    let n4 = s4.h * s4.w, c4 = s4.c
    var mean = [Float](repeating: 0, count: c4)
    for c in 0..<c4 {
      var a: Float = 0
      for p in 0..<n4 { a += s4.d[c * n4 + p] }
      mean[c] = a / Float(n4)
    }
    for c in 0..<c4 {
      var v = cb[c]
      for k in 0..<c4 { v += cw[c * c4 + k] * mean[k] }
      for p in 0..<n4 {
        let t = s4.d[c * n4 + p] + v
        s4.d[c * n4 + p] = t > 0 ? t : 0
      }
    }
    var d = dec(s4, s3, b[4])
    d = dec(d, s2, b[5])
    d = dec(d, s1, b[6])
    let hw = next(), hb = next()
    return pointwise(d, hw, hb, 1, false).d
  }

  private func sep(_ x: T, _ stride: Int) -> T {
    let dw = next(), db = next(), pw = next(), pb = next()
    return pointwise(depthwise(x, dw, db, stride), pw, pb, pb.count, true)
  }

  private func stage(_ x: T, _ n: Int, _ stride: Int) -> T {
    var y = sep(x, stride)
    for _ in 1..<max(1, n) { y = sep(y, 1) }
    return y
  }

  private func dec(_ a: T, _ skip: T, _ n: Int) -> T {
    let pw = next(), pb = next()
    var y = pointwise(upCat(a, skip), pw, pb, pb.count, true)
    for _ in 0..<n { y = sep(y, 1) }
    return y
  }

  private func conv3x3(_ x: T, _ wt: [Float], _ b: [Float], _ cout: Int, _ stride: Int) -> T {
    let ho = (x.h - 1) / stride + 1, wo = (x.w - 1) / stride + 1
    var out = [Float](repeating: 0, count: cout * ho * wo)
    for co in 0..<cout {
      for oy in 0..<ho {
        for ox in 0..<wo {
          var s = b[co]
          for ci in 0..<x.c {
            let base = ci * x.h * x.w, wb = (co * x.c + ci) * 9
            for ky in 0..<3 {
              let iy = oy * stride + ky - 1
              if iy < 0 || iy >= x.h { continue }
              for kx in 0..<3 {
                let ix = ox * stride + kx - 1
                if ix < 0 || ix >= x.w { continue }
                s += wt[wb + ky * 3 + kx] * x.d[base + iy * x.w + ix]
              }
            }
          }
          out[(co * ho + oy) * wo + ox] = s > 0 ? s : 0
        }
      }
    }
    return T(c: cout, h: ho, w: wo, d: out)
  }

  private func depthwise(_ x: T, _ wt: [Float], _ b: [Float], _ stride: Int) -> T {
    let ho = (x.h - 1) / stride + 1, wo = (x.w - 1) / stride + 1
    var out = [Float](repeating: 0, count: x.c * ho * wo)
    x.d.withUnsafeBufferPointer { src in
      for c in 0..<x.c {
        let base = c * x.h * x.w, w0 = c * 9
        for oy in 0..<ho {
          for ox in 0..<wo {
            var s = b[c]
            for ky in 0..<3 {
              let iy = oy * stride + ky - 1
              if iy < 0 || iy >= x.h { continue }
              for kx in 0..<3 {
                let ix = ox * stride + kx - 1
                if ix < 0 || ix >= x.w { continue }
                s += wt[w0 + ky * 3 + kx] * src[base + iy * x.w + ix]
              }
            }
            out[(c * ho + oy) * wo + ox] = s > 0 ? s : 0
          }
        }
      }
    }
    return T(c: x.c, h: ho, w: wo, d: out)
  }

  private func pointwise(_ x: T, _ wt: [Float], _ b: [Float], _ cout: Int, _ relu: Bool) -> T {
    let n = x.h * x.w
    var out = [Float](repeating: 0, count: cout * n)
    out.withUnsafeMutableBufferPointer { dst in
      x.d.withUnsafeBufferPointer { src in
        for co in 0..<cout {
          let o = co * n
          for p in 0..<n { dst[o + p] = b[co] }
          for ci in 0..<x.c {
            let k = wt[co * x.c + ci]
            if k == 0 { continue }
            let si = ci * n
            for p in 0..<n { dst[o + p] += k * src[si + p] }
          }
          if relu { for p in o..<(o + n) where dst[p] < 0 { dst[p] = 0 } }
        }
      }
    }
    return T(c: cout, h: x.h, w: x.w, d: out)
  }

  private func upCat(_ a: T, _ s: T) -> T {
    let h = a.h * 2, w = a.w * 2
    var out = [Float](repeating: 0, count: (a.c + s.c) * h * w)
    for c in 0..<a.c {
      for y in 0..<h {
        for x in 0..<w { out[(c * h + y) * w + x] = a.d[(c * a.h + (y >> 1)) * a.w + (x >> 1)] }
      }
    }
    let off = a.c * h * w
    for k in 0..<s.d.count { out[off + k] = s.d[k] }
    return T(c: a.c + s.c, h: h, w: w, d: out)
  }
}
