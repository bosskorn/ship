package app.onescan.vision

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionFilter
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max

/**
 * Scanner camera. Emits small upright Y/Cb/Cr frames (`onFrame`) so the
 * shared JS detector can draw the live document border and drive auto
 * capture. Frames never leave the device.
 *
 * Photos are always real sensor captures (ImageCapture, maximize-quality mode), never
 * preview/analysis frames. `captureQuality` picks the still size and JPEG quality:
 * - "hd": largest 4:3 size up to ~12.5 MP, JPEG 95 (general documents);
 * - "max": largest size the camera offers up to ~26 MP, JPEG 97 (cards, fine print).
 * The MAX cap keeps one decoded page (w·h·4 bytes ≈ 100 MB) inside the large heap.
 */
class OneScanCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onCameraReady by EventDispatcher()
  private val onFrame by EventDispatcher()
  private val onCameraError by EventDispatcher()

  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER // matches JS aspect-fill mapping
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }
  private val mainHandler = Handler(Looper.getMainLooper())
  private var analysisExecutor: ExecutorService? = null
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var imageCapture: ImageCapture? = null
  private var lastFrameAt = 0L

  var torchEnabled = false
    set(value) {
      field = value
      camera?.cameraControl?.enableTorch(value)
    }
  var active = true
    set(value) {
      if (field == value) return
      field = value
      if (isAttachedToWindow) if (value) bind() else unbind()
    }
  var frameMaxEdge = 192
  var frameIntervalMs = 150L
  var captureQuality = "hd"
    set(value) {
      val v = if (value == "max") "max" else "hd"
      if (field == v) return
      field = v
      rebindCapture()
    }
  private var owner: LifecycleOwner? = null

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) bind()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    unbind()
  }

  private fun bind() {
    val owner = appContext.currentActivity as? LifecycleOwner
    if (owner == null) {
      onCameraError(mapOf("message" to "No lifecycle owner"))
      return
    }
    val executor = Executors.newSingleThreadExecutor().also { analysisExecutor = it }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val p = future.get()
        provider = p
        val preview = Preview.Builder().build()
        preview.setSurfaceProvider(previewView.surfaceProvider)
        val capture = buildCapture()
        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
              .build(),
          )
          .build()
        analysis.setAnalyzer(executor) { proxy -> analyze(proxy) }
        p.unbindAll()
        this.owner = owner
        camera = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture, analysis)
        camera?.cameraControl?.enableTorch(torchEnabled)
        imageCapture = capture
        onCameraReady(readyPayload(capture))
      } catch (e: Exception) {
        onCameraError(mapOf("message" to (e.message ?: "Camera unavailable")))
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun jpegQuality() = if (captureQuality == "max") 97 else 95

  private fun buildCapture(): ImageCapture {
    val capPixels = if (captureQuality == "max") MAX_PIXELS else HD_PIXELS
    val selector = ResolutionSelector.Builder()
      .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
      .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
      .setResolutionFilter(ResolutionFilter { sizes, _ ->
        val within = sizes.filter { it.width.toLong() * it.height <= capPixels }
        within.ifEmpty { sizes.sortedBy { it.width.toLong() * it.height }.take(1) }
      })
      .build()
    return ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
      .setResolutionSelector(selector)
      .setJpegQuality(jpegQuality())
      .build()
  }

  private fun readyPayload(capture: ImageCapture): Map<String, Any> {
    val size = capture.resolutionInfo?.resolution ?: return mapOf("captureQuality" to captureQuality)
    // Sensor orientation: report the upright (portrait) size.
    return mapOf(
      "captureQuality" to captureQuality,
      "captureWidth" to minOf(size.width, size.height),
      "captureHeight" to max(size.width, size.height),
    )
  }

  /** Swap only the still-capture use case (HD ↔ MAX); preview and analysis keep running. */
  private fun rebindCapture() {
    val p = provider ?: return
    val o = owner ?: return
    val old = imageCapture ?: return
    try {
      p.unbind(old)
      val capture = buildCapture()
      camera = p.bindToLifecycle(o, CameraSelector.DEFAULT_BACK_CAMERA, capture)
      camera?.cameraControl?.enableTorch(torchEnabled)
      imageCapture = capture
      onCameraReady(readyPayload(capture))
    } catch (e: Exception) {
      onCameraError(mapOf("message" to (e.message ?: "Camera unavailable")))
    }
  }

  private fun unbind() {
    try {
      provider?.unbindAll()
    } catch (_: Exception) {
    }
    camera = null
    imageCapture = null
    owner = null
    analysisExecutor?.shutdown()
    analysisExecutor = null
  }

  private fun analyze(proxy: ImageProxy) {
    try {
      val now = SystemClock.uptimeMillis()
      if (now - lastFrameAt < frameIntervalMs) return
      lastFrameAt = now
      val yPlane = proxy.planes[0]
      val uPlane = proxy.planes[1] // Cb
      val vPlane = proxy.planes[2] // Cr
      val yBuf = yPlane.buffer
      val uBuf = uPlane.buffer
      val vBuf = vPlane.buffer
      val srcW = proxy.width
      val srcH = proxy.height
      val scale = frameMaxEdge.toFloat() / max(srcW, srcH)
      val dw = max(1, (srcW * scale).toInt())
      val dh = max(1, (srcH * scale).toInt())
      val ys = ByteArray(dw * dh)
      val cbs = ByteArray(dw * dh)
      val crs = ByteArray(dw * dh)
      for (y in 0 until dh) {
        val sy = minOf(srcH - 1, (y / scale).toInt())
        val cy = sy / 2
        for (x in 0 until dw) {
          val sx = minOf(srcW - 1, (x / scale).toInt())
          val cx = sx / 2
          val o = y * dw + x
          ys[o] = yBuf.get(sy * yPlane.rowStride + sx * yPlane.pixelStride)
          cbs[o] = uBuf.get(cy * uPlane.rowStride + cx * uPlane.pixelStride)
          crs[o] = vBuf.get(cy * vPlane.rowStride + cx * vPlane.pixelStride)
        }
      }
      val rot = proxy.imageInfo.rotationDegrees
      val (outW, outH, outY) = rotate(ys, dw, dh, rot)
      val outCb = rotate(cbs, dw, dh, rot).third
      val outCr = rotate(crs, dw, dh, rot).third
      val payload = mutableMapOf<String, Any>(
        "width" to outW,
        "height" to outH,
        "brightness" to FrameStats.brightness(outY),
        "sharpness" to FrameStats.sharpness(outY, outW, outH),
      )
      val model = DocSeg.get(context)
      if (model != null) {
        // JS only turns the 64×64 mask into a quad; no frame pixels cross the bridge.
        payload["mask"] = Base64.encodeToString(model.mask(outY, outCb, outCr, outW, outH), Base64.NO_WRAP)
      } else {
        payload["data"] = Base64.encodeToString(outY, Base64.NO_WRAP)
        payload["cb"] = Base64.encodeToString(outCb, Base64.NO_WRAP)
        payload["cr"] = Base64.encodeToString(outCr, Base64.NO_WRAP)
      }
      mainHandler.post { onFrame(payload) }
    } catch (_: Exception) {
      // Drop the frame; detection is best-effort.
    } finally {
      proxy.close()
    }
  }

  private fun rotate(src: ByteArray, w: Int, h: Int, degrees: Int): Triple<Int, Int, ByteArray> {
    return when ((degrees % 360 + 360) % 360) {
      90 -> {
        val out = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) out[x * h + (h - 1 - y)] = src[y * w + x]
        Triple(h, w, out)
      }
      180 -> {
        val out = ByteArray(w * h)
        for (i in src.indices) out[w * h - 1 - i] = src[i]
        Triple(w, h, out)
      }
      270 -> {
        val out = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) out[(w - 1 - x) * h + y] = src[y * w + x]
        Triple(h, w, out)
      }
      else -> Triple(w, h, src)
    }
  }

  fun takePhoto(promise: Promise) {
    val capture = imageCapture
    if (capture == null) {
      promise.reject("E_NOT_READY", "Camera is not ready", null)
      return
    }
    val file = File(ImageIO.outputDir(context), "capture-${UUID.randomUUID()}.jpg")
    val startedAt = SystemClock.uptimeMillis()
    val quality = jpegQuality()
    capture.takePicture(
      ImageCapture.OutputFileOptions.Builder(file).build(),
      ContextCompat.getMainExecutor(context),
      object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
          val (w, h) = ImageIO.uprightSize(file)
          promise.resolve(
            mapOf(
              "uri" to ImageIO.uriOf(file),
              "width" to w,
              "height" to h,
              "quality" to quality,
              "bytes" to file.length(),
              "captureMs" to (SystemClock.uptimeMillis() - startedAt),
            ),
          )
        }

        override fun onError(exception: ImageCaptureException) {
          promise.reject("E_CAPTURE", exception.message, exception)
        }
      },
    )
  }

  companion object {
    private const val HD_PIXELS = 12_600_000L
    private const val MAX_PIXELS = 26_000_000L
  }
}
