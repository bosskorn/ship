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
 * Scanner camera. Emits small upright luminance frames (`onFrame`) so the
 * shared JS detector can draw the live document border and drive auto
 * capture. Frames never leave the device.
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
        val capture = ImageCapture.Builder()
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
          .build()
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
        camera = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture, analysis)
        camera?.cameraControl?.enableTorch(torchEnabled)
        imageCapture = capture
        onCameraReady(mapOf<String, Any>())
      } catch (e: Exception) {
        onCameraError(mapOf("message" to (e.message ?: "Camera unavailable")))
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun unbind() {
    try {
      provider?.unbindAll()
    } catch (_: Exception) {
    }
    camera = null
    imageCapture = null
    analysisExecutor?.shutdown()
    analysisExecutor = null
  }

  private fun analyze(proxy: ImageProxy) {
    try {
      val now = SystemClock.uptimeMillis()
      if (now - lastFrameAt < frameIntervalMs) return
      lastFrameAt = now
      val plane = proxy.planes[0]
      val buffer = plane.buffer
      val rowStride = plane.rowStride
      val pixelStride = plane.pixelStride
      val srcW = proxy.width
      val srcH = proxy.height
      val scale = frameMaxEdge.toFloat() / max(srcW, srcH)
      val dw = max(1, (srcW * scale).toInt())
      val dh = max(1, (srcH * scale).toInt())
      val small = ByteArray(dw * dh)
      for (y in 0 until dh) {
        val sy = minOf(srcH - 1, (y / scale).toInt())
        for (x in 0 until dw) {
          val sx = minOf(srcW - 1, (x / scale).toInt())
          small[y * dw + x] = buffer.get(sy * rowStride + sx * pixelStride)
        }
      }
      val (outW, outH, out) = rotate(small, dw, dh, proxy.imageInfo.rotationDegrees)
      val data = Base64.encodeToString(out, Base64.NO_WRAP)
      mainHandler.post { onFrame(mapOf("width" to outW, "height" to outH, "data" to data)) }
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
    capture.takePicture(
      ImageCapture.OutputFileOptions.Builder(file).build(),
      ContextCompat.getMainExecutor(context),
      object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
          val (w, h) = ImageIO.uprightSize(file)
          promise.resolve(mapOf("uri" to ImageIO.uriOf(file), "width" to w, "height" to h))
        }

        override fun onError(exception: ImageCaptureException) {
          promise.reject("E_CAPTURE", exception.message, exception)
        }
      },
    )
  }
}
