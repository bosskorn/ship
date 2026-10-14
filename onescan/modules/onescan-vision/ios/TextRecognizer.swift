import UIKit
import Vision

/// On-device OCR with Vision (spec §16). No network.
enum OneScanTextRecognizer {
  static func recognize(uri: String, languages: [String]) throws -> [[String: Any]] {
    let image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: 3000)
    guard let cg = OneScanImageIO.cgImage(image) else { return [] }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let supported = (try? request.supportedRecognitionLanguages()) ?? []
    let wanted = languages.flatMap { code -> [String] in
      switch code {
      case "th": return ["th-TH"]
      case "en": return ["en-US"]
      case "zh": return ["zh-Hans", "zh-Hant"]
      case "ja": return ["ja-JP"]
      case "ko": return ["ko-KR"]
      default: return [code]
      }
    }.filter { supported.contains($0) }
    if !wanted.isEmpty { request.recognitionLanguages = wanted }
    if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = wanted.isEmpty }

    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    return (request.results ?? []).compactMap { obs in
      guard let top = obs.topCandidates(1).first else { return nil }
      let b = obs.boundingBox // normalised, bottom-left origin
      return [
        "text": top.string,
        "box": ["x": b.minX, "y": 1 - b.maxY, "width": b.width, "height": b.height],
        "confidence": Double(top.confidence),
      ]
    }
  }
}
