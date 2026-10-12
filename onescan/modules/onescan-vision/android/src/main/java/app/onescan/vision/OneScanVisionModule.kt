package app.onescan.vision

import android.content.Context
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class PointRecord : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
}

class BoxRecord : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 0.0
  @Field val height: Double = 0.0
}

/**
 * OneScan on-device vision (spec §13, §42). No function here performs network I/O.
 * Contract mirrored in `src/native/OneScanVision.ts`.
 */
class OneScanVisionModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("OneScanVision")

    AsyncFunction("grayscaleAsync") { uri: String, maxEdge: Int, withMask: Boolean? ->
      val bmp = ImageIO.loadUpright(ImageIO.fileFromUri(uri), maxEdge)
      try {
        val (y, cb, cr) = ImageIO.ycbcr(bmp)
        val out = mutableMapOf<String, Any>(
          "width" to bmp.width,
          "height" to bmp.height,
          "data" to Base64.encodeToString(y, Base64.NO_WRAP),
          "cb" to Base64.encodeToString(cb, Base64.NO_WRAP),
          "cr" to Base64.encodeToString(cr, Base64.NO_WRAP),
        )
        if (withMask == true) {
          DocSeg.get(context)?.let { out["mask"] = Base64.encodeToString(it.mask(y, cb, cr, bmp.width, bmp.height), Base64.NO_WRAP) }
        }
        out
      } finally {
        bmp.recycle()
      }
    }

    AsyncFunction("processPageAsync") { uri: String, quad: List<PointRecord>?, filter: String, rotation: Int ->
      val r = PageProcessor.process(
        context,
        ImageIO.fileFromUri(uri),
        quad?.map { doubleArrayOf(it.x, it.y) },
        filter,
        rotation,
      )
      mapOf("uri" to ImageIO.uriOf(r.file), "width" to r.width, "height" to r.height)
    }

    AsyncFunction("recognizeTextAsync") { uri: String, languages: List<String> ->
      TextRecognizer.recognize(context, ImageIO.fileFromUri(uri), languages)
    }

    AsyncFunction("redactRegionsAsync") { uri: String, boxes: List<BoxRecord> ->
      val src = ImageIO.loadUpright(ImageIO.fileFromUri(uri), 4096)
      val bmp = if (src.isMutable) src else src.copy(android.graphics.Bitmap.Config.ARGB_8888, true).also { src.recycle() }
      val canvas = android.graphics.Canvas(bmp)
      val paint = android.graphics.Paint().apply { color = android.graphics.Color.BLACK }
      val pad = bmp.height * 0.003f
      for (b in boxes) {
        canvas.drawRect(
          (b.x * bmp.width).toFloat() - pad,
          (b.y * bmp.height).toFloat() - pad,
          ((b.x + b.width) * bmp.width).toFloat() + pad,
          ((b.y + b.height) * bmp.height).toFloat() + pad,
          paint,
        )
      }
      val file = ImageIO.saveJpeg(context, bmp, "redacted", 90)
      bmp.recycle()
      mapOf("uri" to ImageIO.uriOf(file))
    }

    AsyncFunction("renderPdfAsync") { uri: String, maxWidth: Int ->
      mapOf("pages" to PdfRasterizer.render(context, ImageIO.fileFromUri(uri), maxWidth))
    }

    View(OneScanCameraView::class) {
      Events("onCameraReady", "onFrame", "onCameraError")

      Prop("torch") { view: OneScanCameraView, value: Boolean -> view.torchEnabled = value }
      Prop("active") { view: OneScanCameraView, value: Boolean -> view.active = value }
      Prop("frameMaxEdge") { view: OneScanCameraView, value: Int -> view.frameMaxEdge = value.coerceIn(96, 480) }
      Prop("frameIntervalMs") { view: OneScanCameraView, value: Int -> view.frameIntervalMs = value.coerceAtLeast(50).toLong() }

      AsyncFunction("takePhoto") { view: OneScanCameraView, promise: Promise -> view.takePhoto(promise) }
    }
  }
}
