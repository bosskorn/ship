import ExpoModulesCore
import UIKit

struct RegionRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 1
  @Field var height: Double = 1
}

struct PointRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct ProcessOptions: Record {
  /// Master long-edge cap in px; 0 = keep the source resolution.
  @Field var maxEdge: Int = 0
  @Field var quality: Int = 95
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

    AsyncFunction("grayscaleAsync") { (uri: String, maxEdge: Int, withMask: Bool?) -> [String: Any] in
      let image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: CGFloat(maxEdge))
      guard let p = OneScanImageIO.ycbcr(image) else {
        throw NSError(domain: "OneScanVision", code: 20, userInfo: [NSLocalizedDescriptionKey: "Could not read pixels"])
      }
      var out: [String: Any] = [
        "width": p.0,
        "height": p.1,
        "data": p.2.base64EncodedString(),
        "cb": p.3.base64EncodedString(),
        "cr": p.4.base64EncodedString(),
      ]
      if withMask == true, let model = DocSeg.shared() {
        out["mask"] = model.mask(y: [UInt8](p.2), cb: [UInt8](p.3), cr: [UInt8](p.4), width: p.0, height: p.1).base64EncodedString()
      }
      return out
    }

    // Zoomed second pass for small documents (see Android): planes + mask for one region.
    AsyncFunction("grayscaleRegionAsync") { (uri: String, region: RegionRecord, maxEdge: Int, withMask: Bool?) -> [String: Any] in
      let frac = min(max(max(region.width, region.height), 0.05), 1.0)
      let full = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: min(2048, CGFloat(Double(maxEdge) / frac)))
      let e = full.extent
      // Core Image origin is bottom-left; the region is top-left based.
      let rect = CGRect(x: e.minX + region.x * e.width, y: e.minY + (1 - region.y - region.height) * e.height,
                        width: region.width * e.width, height: region.height * e.height).integral.intersection(e)
      let crop = OneScanImageIO.scaled(full.cropped(to: rect), maxEdge: CGFloat(maxEdge))
      guard let p = OneScanImageIO.ycbcr(crop) else {
        throw NSError(domain: "OneScanVision", code: 21, userInfo: [NSLocalizedDescriptionKey: "Could not read pixels"])
      }
      var out: [String: Any] = [
        "width": p.0,
        "height": p.1,
        "data": p.2.base64EncodedString(),
        "cb": p.3.base64EncodedString(),
        "cr": p.4.base64EncodedString(),
      ]
      if withMask == true, let model = DocSeg.shared() {
        out["mask"] = model.mask(y: [UInt8](p.2), cb: [UInt8](p.3), cr: [UInt8](p.4), width: p.0, height: p.1).base64EncodedString()
      }
      return out
    }

    AsyncFunction("processPageAsync") { (uri: String, quad: [PointRecord]?, filter: String, rotation: Int, options: ProcessOptions?) -> [String: Any] in
      let points = quad?.map { CGPoint(x: $0.x, y: $0.y) }
      let o = options ?? ProcessOptions()
      let (url, w, h) = try OneScanPageProcessor.process(uri: uri, quad: points, filter: filter, rotation: rotation, maxEdge: o.maxEdge, quality: o.quality)
      let bytes = (OneScanImageIO.info(url)["bytes"] as? Double) ?? 0
      return ["uri": url.absoluteString, "width": w, "height": h, "bytes": bytes, "quality": min(max(o.quality, 50), 100), "degraded": false]
    }

    /// Smaller copy (preview / thumbnail / OCR working image); never used as the master.
    AsyncFunction("resizeAsync") { (uri: String, maxEdge: Int, quality: Int) -> [String: Any] in
      let image = try OneScanImageIO.loadUpright(OneScanImageIO.url(from: uri), maxEdge: CGFloat(maxEdge))
      let (url, w, h) = try OneScanImageIO.saveJpeg(image, prefix: "copy", quality: CGFloat(min(max(quality, 50), 100)) / 100)
      return ["uri": url.absoluteString, "width": w, "height": h, "bytes": (OneScanImageIO.info(url)["bytes"] as? Double) ?? 0]
    }

    AsyncFunction("imageInfoAsync") { (uri: String) -> [String: Any] in
      OneScanImageIO.info(OneScanImageIO.url(from: uri))
    }

    /// PDF that embeds each page JPEG unchanged (see PdfWriter.swift).
    AsyncFunction("writePdfAsync") { (pageUris: [String]) -> [String: Any] in
      let out = OneScanImageIO.outputDir().appendingPathComponent("document-\(UUID().uuidString).pdf")
      try OneScanPdfWriter.write(to: out, pages: pageUris.map { OneScanImageIO.url(from: $0) })
      return ["uri": out.absoluteString, "pageCount": pageUris.count, "bytes": (OneScanImageIO.info(out)["bytes"] as? Double) ?? 0]
    }

    // VisionKit has no gallery import; `allowGallery` only applies on Android.
    AsyncFunction("scanDocumentsAsync") { (pageLimit: Int, allowGallery: Bool, promise: Promise) in
      _ = allowGallery
      OneScanDocumentScanner.start(from: self.appContext?.utilities?.currentViewController(), pageLimit: pageLimit, promise: promise)
    }.runOnQueue(.main)

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
      Prop("captureQuality") { (view: OneScanCameraView, value: String) in view.captureQuality = value }

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
