import Foundation

/// Minimal PDF writer that embeds each page's JPEG bytes unchanged (DCTDecode), streamed
/// from disk page by page. Mirror of `android/.../PdfWriter.kt` (same layout and output).
enum OneScanPdfWriter {
  private static let a4W = 595.28
  private static let a4H = 841.89

  struct JpegInfo: Equatable {
    let width: Int
    let height: Int
    let components: Int
  }

  enum Failure: Error { case notJpeg(String), noFrame(String), io(String) }

  /// Size and colour components from the JPEG's SOF marker.
  static func jpegInfo(_ url: URL) throws -> JpegInfo {
    guard let h = try? FileHandle(forReadingFrom: url) else { throw Failure.io(url.lastPathComponent) }
    defer { try? h.close() }
    // Headers live in the first few hundred KB even with large EXIF/ICC blocks.
    let data = [UInt8](h.readData(ofLength: 1 << 20))
    guard data.count > 4, data[0] == 0xFF, data[1] == 0xD8 else { throw Failure.notJpeg(url.lastPathComponent) }
    var i = 2
    while i + 3 < data.count {
      guard data[i] == 0xFF else { i += 1; continue }
      var marker = data[i + 1]
      i += 2
      while marker == 0xFF, i < data.count { marker = data[i]; i += 1 }
      if marker == 0xD8 || (0xD0...0xD7).contains(marker) || marker == 0x01 { continue }
      if marker == 0xD9 || marker == 0xDA { break }
      guard i + 1 < data.count else { break }
      let len = Int(data[i]) << 8 | Int(data[i + 1])
      let isSof = (0xC0...0xCF).contains(marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC
      if isSof, i + 7 < data.count {
        let height = Int(data[i + 3]) << 8 | Int(data[i + 4])
        let width = Int(data[i + 5]) << 8 | Int(data[i + 6])
        let comps = Int(data[i + 7])
        guard width > 0, height > 0 else { break }
        return JpegInfo(width: width, height: height, components: comps)
      }
      i += len
    }
    throw Failure.noFrame(url.lastPathComponent)
  }

  static func write(to out: URL, pages: [URL]) throws {
    guard !pages.isEmpty else { throw Failure.io("no pages") }
    let infos = try pages.map { try jpegInfo($0) }
    guard FileManager.default.createFile(atPath: out.path, contents: nil),
          let o = try? FileHandle(forWritingTo: out) else { throw Failure.io(out.lastPathComponent) }
    defer { try? o.close() }
    var count = 0
    var offsets: [Int] = []
    func put(_ d: Data) { o.write(d); count += d.count }
    func ascii(_ s: String) { put(Data(s.utf8)) }
    func f(_ v: Double) -> String { String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), v) }
    func obj(_ n: Int, _ body: () throws -> Void) rethrows {
      while offsets.count < n { offsets.append(0) }
      offsets[n - 1] = count
      ascii("\(n) 0 obj\n")
      try body()
      ascii("\nendobj\n")
    }
    let pageObj = { (i: Int) in 3 + i * 3 }

    ascii("%PDF-1.4\n")
    put(Data([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]))
    obj(1) { ascii("<< /Type /Catalog /Pages 2 0 R >>") }
    obj(2) {
      ascii("<< /Type /Pages /Count \(pages.count) /Kids [\(pages.indices.map { "\(pageObj($0)) 0 R" }.joined(separator: " "))] >>")
    }
    for (i, url) in pages.enumerated() {
      let info = infos[i]
      let landscape = info.width > info.height
      let pw = landscape ? a4H : a4W
      let ph = landscape ? a4W : a4H
      let scale = min(pw / Double(info.width), ph / Double(info.height))
      let dw = Double(info.width) * scale, dh = Double(info.height) * scale
      let dx = (pw - dw) / 2, dy = (ph - dh) / 2
      let n = pageObj(i)
      obj(n) {
        ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 \(f(pw)) \(f(ph))] ")
        ascii("/Resources << /XObject << /Im0 \(n + 2) 0 R >> >> /Contents \(n + 1) 0 R >>")
      }
      let content = Data("q \(f(dw)) 0 0 \(f(dh)) \(f(dx)) \(f(dy)) cm /Im0 Do Q".utf8)
      obj(n + 1) {
        ascii("<< /Length \(content.count) >>\nstream\n")
        put(content)
        ascii("\nendstream")
      }
      let colorSpace: String
      switch info.components {
      case 1: colorSpace = "/DeviceGray"
      case 4: colorSpace = "/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]"
      default: colorSpace = "/DeviceRGB"
      }
      let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
      try obj(n + 2) {
        ascii("<< /Type /XObject /Subtype /Image /Width \(info.width) /Height \(info.height) /ColorSpace \(colorSpace) /BitsPerComponent 8 /Filter /DCTDecode /Length \(size) >>\nstream\n")
        guard let r = try? FileHandle(forReadingFrom: url) else { throw Failure.io(url.lastPathComponent) }
        defer { try? r.close() }
        var copied = 0
        while true {
          let chunk = r.readData(ofLength: 1 << 16)
          if chunk.isEmpty { break }
          put(chunk)
          copied += chunk.count
        }
        guard copied == size else { throw Failure.io(url.lastPathComponent) }
        ascii("\nendstream")
      }
    }
    let xref = count
    ascii("xref\n0 \(offsets.count + 1)\n0000000000 65535 f \n")
    for off in offsets { ascii(String(format: "%010d 00000 n \n", off)) }
    ascii("trailer\n<< /Size \(offsets.count + 1) /Root 1 0 R >>\nstartxref\n\(xref)\n%%EOF\n")
  }
}
