package app.onescan.vision

import android.graphics.Bitmap
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

/** Normalised (0..1) rectangle of the upright image. */
class RegionRecord : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 1.0
  @Field val height: Double = 1.0
}

class ProcessOptions : Record {
  /** Master long-edge cap in px; 0 = keep the source resolution. */
  @Field val maxEdge: Int = 0
  @Field val quality: Int = 95
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

    OnCreate {
      appContext.reactContext?.let { SecureFiles.init(it) }
    }

    // ---- Documents at rest (SecureFiles): AES-256-GCM, Keystore-wrapped key.

    /** Copies `src` into `dst` encrypted (dst written via temp file + rename). */
    AsyncFunction("encryptFileAsync") { src: String, dst: String ->
      SecureFiles.init(context)
      SecureFiles.encrypt(ImageIO.rawFileFromUri(src), ImageIO.rawFileFromUri(dst))
      ImageIO.uriOf(ImageIO.rawFileFromUri(dst))
    }

    /** A readable copy (decrypted into the cache) — or the file itself when not encrypted. */
    AsyncFunction("plainUriAsync") { uri: String, name: String? ->
      SecureFiles.init(context)
      ImageIO.uriOf(SecureFiles.plain(ImageIO.rawFileFromUri(uri), name))
    }

    AsyncFunction("isEncryptedAsync") { uri: String -> SecureFiles.isEncrypted(ImageIO.rawFileFromUri(uri)) }

    /** Encrypts a plaintext file in place (verified, atomic); false if it already was. */
    AsyncFunction("migrateFileAsync") { uri: String ->
      SecureFiles.init(context)
      SecureFiles.migrate(ImageIO.rawFileFromUri(uri))
    }

    AsyncFunction("databaseKeyAsync") {
      SecureFiles.init(context)
      SecureFiles.databaseKeyHex()
    }

    AsyncFunction("clearPlainCacheAsync") {
      SecureFiles.init(context)
      SecureFiles.clearPlainCache()
    }

    /** True when the file is an unencrypted SQLite database ("SQLite format 3" header). */
    AsyncFunction("isPlainSqliteAsync") { path: String ->
      val f = ImageIO.rawFileFromUri(path)
      if (!f.isFile || f.length() < 16) return@AsyncFunction false
      val head = ByteArray(16)
      java.io.FileInputStream(f).use { it.read(head) }
      String(head, Charsets.US_ASCII).startsWith("SQLite format 3")
    }

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

    // Zoomed second pass for small documents: the same planes (+ page mask) for one region
    // of the photo, decoded at a resolution that gives the region `maxEdge` pixels.
    AsyncFunction("grayscaleRegionAsync") { uri: String, region: RegionRecord, maxEdge: Int, withMask: Boolean? ->
      val frac = maxOf(region.width, region.height).coerceIn(0.05, 1.0)
      val full = ImageIO.loadUpright(ImageIO.fileFromUri(uri), minOf(2048, (maxEdge / frac).toInt()))
      try {
        val x0 = (region.x * full.width).toInt().coerceIn(0, full.width - 2)
        val y0 = (region.y * full.height).toInt().coerceIn(0, full.height - 2)
        val w = (region.width * full.width).toInt().coerceIn(2, full.width - x0)
        val h = (region.height * full.height).toInt().coerceIn(2, full.height - y0)
        val s = minOf(1.0, maxEdge.toDouble() / maxOf(w, h))
        val crop = Bitmap.createBitmap(full, x0, y0, w, h)
        val bmp = if (s < 1.0) Bitmap.createScaledBitmap(crop, maxOf(2, (w * s).toInt()), maxOf(2, (h * s).toInt()), true).also { if (it != crop) crop.recycle() } else crop
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
          if (bmp != full) bmp.recycle()
        }
      } finally {
        full.recycle()
      }
    }

    AsyncFunction("processPageAsync") { uri: String, quad: List<PointRecord>?, filter: String, rotation: Int, options: ProcessOptions? ->
      val o = options ?: ProcessOptions()
      val r = PageProcessor.process(
        context,
        ImageIO.fileFromUri(uri),
        quad?.map { doubleArrayOf(it.x, it.y) },
        filter,
        rotation,
        o.maxEdge,
        o.quality,
      )
      mapOf(
        "uri" to ImageIO.uriOf(r.file),
        "width" to r.width,
        "height" to r.height,
        "bytes" to r.file.length().toDouble(),
        "quality" to r.quality,
        "degraded" to r.degraded,
      )
    }

    /** Smaller copy (preview / thumbnail / OCR working image); never used as the master. */
    AsyncFunction("resizeAsync") { uri: String, maxEdge: Int, quality: Int ->
      val bmp = ImageIO.loadUpright(ImageIO.fileFromUri(uri), maxEdge)
      try {
        val file = ImageIO.saveJpeg(context, bmp, "copy", quality.coerceIn(50, 100))
        mapOf("uri" to ImageIO.uriOf(file), "width" to bmp.width, "height" to bmp.height, "bytes" to file.length().toDouble())
      } finally {
        bmp.recycle()
      }
    }

    AsyncFunction("imageInfoAsync") { uri: String ->
      ImageIO.info(ImageIO.fileFromUri(uri))
    }

    /** PDF that embeds each page JPEG unchanged (see PdfWriter). */
    AsyncFunction("writePdfAsync") { pageUris: List<String> ->
      val out = java.io.File(ImageIO.outputDir(context), "document-${java.util.UUID.randomUUID()}.pdf")
      PdfWriter.write(out, pageUris.map { ImageIO.fileFromUri(it) })
      mapOf("uri" to ImageIO.uriOf(out), "pageCount" to pageUris.size, "bytes" to out.length().toDouble())
    }

    AsyncFunction("scanDocumentsAsync") { pageLimit: Int, allowGallery: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_SCANNER_UNAVAILABLE", "No activity", null)
      } else {
        DocumentScanner.start(activity, pageLimit, allowGallery, promise)
      }
    }

    OnActivityResult { _, payload ->
      DocumentScanner.onResult(context, payload.requestCode, payload.resultCode, payload.data)
    }

    AsyncFunction("recognizeTextAsync") { uri: String, languages: List<String> ->
      TextRecognizer.recognize(context, ImageIO.fileFromUri(uri), languages)
    }

    AsyncFunction("redactRegionsAsync") { uri: String, boxes: List<BoxRecord> ->
      // Full resolution: a redacted copy must stay as legible as the original.
      val src = ImageIO.decodeForOutput(ImageIO.fileFromUri(uri), 0)
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
      val file = ImageIO.saveJpeg(context, bmp, "redacted", 95)
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
      Prop("captureQuality") { view: OneScanCameraView, value: String -> view.captureQuality = value }

      AsyncFunction("takePhoto") { view: OneScanCameraView, promise: Promise -> view.takePhoto(promise) }
    }
  }
}
