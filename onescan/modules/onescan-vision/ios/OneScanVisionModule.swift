import ExpoModulesCore
import UIKit

struct PointRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct BoxRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

/// OneScan on-device vision (spec §13, §42). No function here performs network I/O.
/// Contract mirrored in `src/native/OneScanVision.ts`.
public class OneScanVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OneScanVision")

    AsyncFunction("grayscaleAsync") { (uri: String, maxEdge: Int) -> [String: Any] in
      let image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: CGFloat(maxEdge))
      guard let p = OneScanImageIO.ycbcr(image) else {
        throw NSError(domain: "OneScanVision", code: 20, userInfo: [NSLocalizedDescriptionKey: "Could not read pixels"])
      }
      return [
        "width": p.0,
        "height": p.1,
        "data": p.2.base64EncodedString(),
        "cb": p.3.base64EncodedString(),
        "cr": p.4.base64EncodedString(),
      ]
    }

    AsyncFunction("processPageAsync") { (uri: String, quad: [PointRecord]?, filter: String, rotation: Int) -> [String: Any] in
      let points = quad?.map { CGPoint(x: $0.x, y: $0.y) }
      let (url, w, h) = try OneScanPageProcessor.process(uri: uri, quad: points, filter: filter, rotation: rotation)
      return ["uri": url.absoluteString, "width": w, "height": h]
    }

    AsyncFunction("recognizeTextAsync") { (uri: String, languages: [String]) -> [[String: Any]] in
      try OneScanTextRecognizer.recognize(uri: uri, languages: languages)
    }

    AsyncFunction("redactRegionsAsync") { (uri: String, boxes: [BoxRecord]) -> [String: Any] in
      let url = try OneScanPdfRasterizer.redact(uri: uri, boxes: boxes.map { ["x": $0.x, "y": $0.y, "width": $0.width, "height": $0.height] })
      return ["uri": url.absoluteString]
    }

    AsyncFunction("renderPdfAsync") { (uri: String, maxWidth: Int) -> [String: Any] in
      ["pages": try OneScanPdfRasterizer.render(uri: uri, maxWidth: CGFloat(maxWidth))]
    }

    View(OneScanCameraView.self) {
      Events("onCameraReady", "onFrame", "onCameraError")

      Prop("torch") { (view: OneScanCameraView, value: Bool) in view.torch = value }
      Prop("active") { (view: OneScanCameraView, value: Bool) in view.active = value }
      Prop("frameMaxEdge") { (view: OneScanCameraView, value: Int) in view.frameMaxEdge = min(max(value, 96), 480) }
      Prop("frameIntervalMs") { (view: OneScanCameraView, value: Int) in view.frameIntervalMs = max(value, 50) }

      AsyncFunction("takePhoto") { (view: OneScanCameraView, promise: Promise) in
        view.takePhoto { result in
          switch result {
          case .success(let info): promise.resolve(info)
          case .failure(let error): promise.reject("E_CAPTURE", error.localizedDescription)
          }
        }
      }
    }
  }
}
