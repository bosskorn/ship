import AVFoundation
import ExpoModulesCore
import UIKit

/// Scanner camera. Emits small upright Y/Cb/Cr frames for the shared JS
/// detector (live border + auto capture). Frames never leave the device.
///
/// Photos are real AVCapturePhotoOutput captures (quality prioritised), never video
/// frames, saved as JPEG 0.97 (the kept original). `captureQuality` picks the still size:
/// "hd" = largest size up to ~12.5 MP, "max" = largest size up to ~26 MP. Switching only
/// changes maxPhotoDimensions; the session keeps running.
class OneScanCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
  let onCameraReady = EventDispatcher()
  let onFrame = EventDispatcher()
  let onCameraError = EventDispatcher()

  var torch = false { didSet { applyTorch() } }
  var active = true { didSet { active ? start() : stop() } }
  var frameMaxEdge = 192
  var frameIntervalMs = 150
  var captureQuality = "hd" {
    didSet {
      if captureQuality != "max" && captureQuality != "hd" { captureQuality = "hd" }
      if oldValue != captureQuality { sessionQueue.async { [weak self] in self?.applyPhotoDimensions(notify: true) } }
    }
  }

  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "app.onescan.camera.session")
  private let frameQueue = DispatchQueue(label: "app.onescan.camera.frames")
  private let photoOut = AVCapturePhotoOutput()
  private let videoOut = AVCaptureVideoDataOutput()
  private var device: AVCaptureDevice?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var configured = false
  private var lastFrameAt: CFTimeInterval = 0
  private var pendingPhoto: ((Result<[String: Any], Error>) -> Void)?
  private var photoStartedAt: CFTimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill // matches JS aspect-fill mapping
    self.layer.addSublayer(layer)
    previewLayer = layer
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, active { start() } else { stop() }
  }

  private func start() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if !self.configured { self.configure() }
      if self.configured, !self.session.isRunning {
        self.session.startRunning()
        DispatchQueue.main.async {
          self.applyTorch()
          self.onCameraReady(self.readyPayload())
        }
      }
    }
  }

  private func stop() {
    sessionQueue.async { [weak self] in
      if self?.session.isRunning == true { self?.session.stopRunning() }
    }
  }

  private func configure() {
    session.beginConfiguration()
    session.sessionPreset = .photo
    defer { session.commitConfiguration() }
    guard let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let input = try? AVCaptureDeviceInput(device: cam), session.canAddInput(input) else {
      DispatchQueue.main.async { self.onCameraError(["message": "Camera unavailable"]) }
      return
    }
    session.addInput(input)
    device = cam
    if session.canAddOutput(photoOut) {
      session.addOutput(photoOut)
      photoOut.maxPhotoQualityPrioritization = .quality
    }
    applyPhotoDimensions(notify: false)
    videoOut.alwaysDiscardsLateVideoFrames = true
    videoOut.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
    videoOut.setSampleBufferDelegate(self, queue: frameQueue)
    if session.canAddOutput(videoOut) { session.addOutput(videoOut) }
    for output in [videoOut as AVCaptureOutput, photoOut] {
      guard let conn = output.connection(with: .video) else { continue }
      if #available(iOS 17.0, *) {
        if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }
      } else if conn.isVideoOrientationSupported {
        conn.videoOrientation = .portrait
      }
    }
    configured = true
  }

  private let jpegQuality = 0.97

  /// Largest supported still size within the tier's pixel cap (iOS 16+; older devices keep the preset's size).
  private func applyPhotoDimensions(notify: Bool) {
    guard let cam = device else { return }
    if #available(iOS 16.0, *) {
      let cap: Int64 = captureQuality == "max" ? 26_000_000 : 12_600_000
      let dims = cam.activeFormat.supportedMaxPhotoDimensions
      let within = dims.filter { Int64($0.width) * Int64($0.height) <= cap }
      let pick = within.max { Int64($0.width) * Int64($0.height) < Int64($1.width) * Int64($1.height) }
        ?? dims.min { Int64($0.width) * Int64($0.height) < Int64($1.width) * Int64($1.height) }
      if let pick { photoOut.maxPhotoDimensions = pick }
    }
    if notify {
      DispatchQueue.main.async { self.onCameraReady(self.readyPayload()) }
    }
  }

  private func readyPayload() -> [String: Any] {
    var out: [String: Any] = ["captureQuality": captureQuality]
    if #available(iOS 16.0, *) {
      let d = photoOut.maxPhotoDimensions
      if d.width > 0 {
        out["captureWidth"] = Int(min(d.width, d.height))
        out["captureHeight"] = Int(max(d.width, d.height))
      }
    }
    return out
  }

  private func applyTorch() {
    guard let d = device, d.hasTorch else { return }
    do {
      try d.lockForConfiguration()
      d.torchMode = torch ? .on : .off
      d.unlockForConfiguration()
    } catch {}
  }

  // MARK: Frames

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    guard (now - lastFrameAt) * 1000 >= Double(frameIntervalMs),
          let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lastFrameAt = now
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 2,
          let yBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0),
          let cBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) else { return }
    let srcW = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
    let srcH = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
    let yStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    let cStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1) // interleaved Cb,Cr at half resolution
    let scale = Double(frameMaxEdge) / Double(max(srcW, srcH))
    let dw = max(1, Int(Double(srcW) * scale))
    let dh = max(1, Int(Double(srcH) * scale))
    var ys = Data(count: dw * dh)
    var cbs = Data(count: dw * dh)
    var crs = Data(count: dw * dh)
    let ySrc = yBase.assumingMemoryBound(to: UInt8.self)
    let cSrc = cBase.assumingMemoryBound(to: UInt8.self)
    ys.withUnsafeMutableBytes { yRaw in
      cbs.withUnsafeMutableBytes { cbRaw in
        crs.withUnsafeMutableBytes { crRaw in
          let yDst = yRaw.bindMemory(to: UInt8.self)
          let cbDst = cbRaw.bindMemory(to: UInt8.self)
          let crDst = crRaw.bindMemory(to: UInt8.self)
          for y in 0..<dh {
            let sy = min(srcH - 1, Int(Double(y) / scale))
            for x in 0..<dw {
              let sx = min(srcW - 1, Int(Double(x) / scale))
              let o = y * dw + x
              yDst[o] = ySrc[sy * yStride + sx]
              let c = (sy / 2) * cStride + (sx / 2) * 2
              cbDst[o] = cSrc[c]
              crDst[o] = cSrc[c + 1]
            }
          }
        }
      }
    }
    let yBytes = [UInt8](ys)
    var payload: [String: Any] = [
      "width": dw,
      "height": dh,
      "brightness": OneScanFrameStats.brightness(yBytes),
      "sharpness": OneScanFrameStats.sharpness(yBytes, width: dw, height: dh),
    ]
    if let model = DocSeg.shared() {
      // JS only turns the 64×64 mask into a quad; no frame pixels cross the bridge.
      payload["mask"] = model.mask(y: yBytes, cb: [UInt8](cbs), cr: [UInt8](crs), width: dw, height: dh).base64EncodedString()
    } else {
      payload["data"] = ys.base64EncodedString()
      payload["cb"] = cbs.base64EncodedString()
      payload["cr"] = crs.base64EncodedString()
    }
    DispatchQueue.main.async { [weak self] in self?.onFrame(payload) }
  }

  // MARK: Photo

  func takePhoto(_ completion: @escaping (Result<[String: Any], Error>) -> Void) {
    guard configured, session.isRunning else {
      completion(.failure(NSError(domain: "OneScanVision", code: 10, userInfo: [NSLocalizedDescriptionKey: "Camera is not ready"])))
      return
    }
    pendingPhoto = completion
    photoStartedAt = CACurrentMediaTime()
    let settings = AVCapturePhotoSettings(format: [
      AVVideoCodecKey: AVVideoCodecType.jpeg,
      AVVideoCompressionPropertiesKey: [AVVideoQualityKey: jpegQuality],
    ])
    settings.photoQualityPrioritization = .quality
    if #available(iOS 16.0, *) { settings.maxPhotoDimensions = photoOut.maxPhotoDimensions }
    photoOut.capturePhoto(with: settings, delegate: self)
  }

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    let done = pendingPhoto
    pendingPhoto = nil
    if let error { done?(.failure(error)); return }
    guard let data = photo.fileDataRepresentation() else {
      done?(.failure(NSError(domain: "OneScanVision", code: 11, userInfo: [NSLocalizedDescriptionKey: "No photo data"])))
      return
    }
    let url = OneScanImageIO.outputDir().appendingPathComponent("capture-\(UUID().uuidString).jpg")
    do {
      try data.write(to: url)
      let img = CIImage(contentsOf: url, options: [.applyOrientationProperty: true])
      let e = img?.extent ?? .zero
      done?(.success([
        "uri": url.absoluteString,
        "width": Int(e.width),
        "height": Int(e.height),
        "quality": Int((jpegQuality * 100).rounded()),
        "bytes": data.count,
        "captureMs": Int((CACurrentMediaTime() - photoStartedAt) * 1000),
      ]))
    } catch {
      done?(.failure(error))
    }
  }
}
