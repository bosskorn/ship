import ExpoModulesCore
import UIKit
import VisionKit

/// System document scanner (VisionKit `VNDocumentCameraViewController`): edge detection,
/// auto capture and perspective correction on device. Pages are written to the app's
/// output directory as JPEG and returned as file URIs; nothing is uploaded.
final class OneScanDocumentScanner: NSObject, VNDocumentCameraViewControllerDelegate {
  private static var active: OneScanDocumentScanner?

  private let promise: Promise
  private let pageLimit: Int

  private init(promise: Promise, pageLimit: Int) {
    self.promise = promise
    self.pageLimit = max(1, pageLimit)
  }

  static func start(from presenter: UIViewController?, pageLimit: Int, promise: Promise) {
    guard VNDocumentCameraViewController.isSupported, let presenter else {
      promise.reject("E_SCANNER_UNAVAILABLE", "Document scanner is not available on this device")
      return
    }
    guard active == nil else {
      promise.reject("E_SCANNER_BUSY", "A scan is already in progress")
      return
    }
    let scanner = OneScanDocumentScanner(promise: promise, pageLimit: pageLimit)
    active = scanner
    let vc = VNDocumentCameraViewController()
    vc.delegate = scanner
    presenter.present(vc, animated: true)
  }

  private func finish(_ controller: VNDocumentCameraViewController, _ result: () -> Void) {
    controller.dismiss(animated: true)
    result()
    OneScanDocumentScanner.active = nil
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    var pages: [[String: Any]] = []
    do {
      for i in 0..<min(scan.pageCount, pageLimit) {
        let image = scan.imageOfPage(at: i)
        // VisionKit hands back a UIImage, so this one encode is the original; keep it high.
        guard let data = image.jpegData(compressionQuality: 0.97) else { continue }
        let url = OneScanImageIO.outputDir().appendingPathComponent("scan_\(UUID().uuidString).jpg")
        try data.write(to: url)
        pages.append(["uri": url.absoluteString, "width": Int(image.size.width * image.scale), "height": Int(image.size.height * image.scale)])
      }
      finish(controller) { promise.resolve(["pages": pages]) }
    } catch {
      finish(controller) { promise.reject("E_SCANNER_FAILED", error.localizedDescription) }
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    finish(controller) { promise.resolve(["pages": [[String: Any]]()]) }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    finish(controller) { promise.reject("E_SCANNER_FAILED", error.localizedDescription) }
  }
}
