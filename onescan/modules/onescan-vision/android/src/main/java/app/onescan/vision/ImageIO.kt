package app.onescan.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/** File/bitmap helpers. Everything stays in the app sandbox (cache dir). */
internal object ImageIO {
  fun fileFromUri(uri: String): File {
    if (uri.startsWith("file://")) return File(Uri.parse(uri).path ?: uri.removePrefix("file://"))
    return File(uri)
  }

  fun uriOf(file: File): String = Uri.fromFile(file).toString()

  fun exifRotation(file: File): Int = try {
    ExifInterface(file.absolutePath).rotationDegrees
  } catch (_: Exception) {
    0
  }

  /** Size after applying EXIF orientation. */
  fun uprightSize(file: File): Pair<Int, Int> {
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, opts)
    val rot = exifRotation(file)
    return if (rot == 90 || rot == 270) Pair(opts.outHeight, opts.outWidth) else Pair(opts.outWidth, opts.outHeight)
  }

  /**
   * Decode with subsampling so the long edge is ≤ [maxEdge], then apply EXIF
   * rotation. Never loads a full 12–50 MP frame into memory at once.
   */
  fun loadUpright(file: File, maxEdge: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("Unreadable image: ${file.name}")
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    val opts = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    var bmp = BitmapFactory.decodeFile(file.absolutePath, opts)
      ?: throw IllegalArgumentException("Unreadable image: ${file.name}")
    val long = max(bmp.width, bmp.height)
    if (long > maxEdge) {
      val s = maxEdge.toFloat() / long
      val scaled = Bitmap.createScaledBitmap(bmp, max(1, (bmp.width * s).roundToInt()), max(1, (bmp.height * s).roundToInt()), true)
      if (scaled != bmp) bmp.recycle()
      bmp = scaled
    }
    return rotate(bmp, exifRotation(file))
  }

  fun rotate(bmp: Bitmap, degrees: Int): Bitmap {
    val d = ((degrees % 360) + 360) % 360
    if (d == 0) return bmp
    val m = Matrix().apply { postRotate(d.toFloat()) }
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    if (out != bmp) bmp.recycle()
    return out
  }

  fun outputDir(context: Context): File = File(context.cacheDir, "onescan").apply { mkdirs() }

  /**
   * Decode for a document master: full resolution unless the long edge exceeds
   * [maxEdge] by more than [SLACK] (≤ 0 = never downscale). A small overshoot is kept
   * as is, because resampling by a few percent only blurs text. Large reductions use
   * a power-of-two inSampleSize first (clean box filter), then one smooth scale.
   */
  fun decodeForOutput(file: File, maxEdge: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("Unreadable image: ${file.name}")
    val long = max(bounds.outWidth, bounds.outHeight)
    val target = outputEdge(bounds.outWidth, bounds.outHeight, maxEdge)
    var sample = 1
    while (long / (sample * 2) >= target) sample *= 2
    val opts = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
      inMutable = true
    }
    var bmp = BitmapFactory.decodeFile(file.absolutePath, opts) ?: throw IllegalArgumentException("Unreadable image: ${file.name}")
    val decodedLong = max(bmp.width, bmp.height)
    if (decodedLong > target * SLACK || bmp.width.toLong() * bmp.height > MAX_OUTPUT_PIXELS) {
      val s = target.toFloat() / decodedLong
      val scaled = Bitmap.createScaledBitmap(bmp, max(1, (bmp.width * s).roundToInt()), max(1, (bmp.height * s).roundToInt()), true)
      if (scaled != bmp) bmp.recycle()
      bmp = scaled
    }
    return rotate(bmp, exifRotation(file))
  }

  private const val SLACK = 1.15f

  /**
   * RAM ceiling for any decoded page (≈ 104 MB as ARGB): 48/64 MP photos are rendered at
   * ~26 MP instead of decoded whole. Mirrors `MAX_OUTPUT_PIXELS` in quality.ts and the iOS
   * PageProcessor.
   */
  const val MAX_OUTPUT_PIXELS = 26_000_000L

  /** Output long edge: the cap (with slack), then the pixel budget. Never upscales. */
  fun outputEdge(w: Int, h: Int, maxEdge: Int): Int {
    val long = max(w, h)
    var target = if (maxEdge <= 0 || long <= maxEdge * SLACK) long else maxEdge
    val s = target.toDouble() / long
    val px = w * s * (h * s)
    if (px > MAX_OUTPUT_PIXELS) target = kotlin.math.floor(target * kotlin.math.sqrt(MAX_OUTPUT_PIXELS / px)).toInt()
    return target
  }

  /** Upright size, file size and type, without decoding pixels. */
  fun info(file: File): Map<String, Any> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    val rot = exifRotation(file)
    val swap = rot == 90 || rot == 270
    return mapOf(
      "width" to if (swap) bounds.outHeight else bounds.outWidth,
      "height" to if (swap) bounds.outWidth else bounds.outHeight,
      "bytes" to file.length().toDouble(),
      "mimeType" to (bounds.outMimeType ?: "unknown"),
      "orientation" to rot,
    )
  }

  fun saveJpeg(context: Context, bmp: Bitmap, prefix: String, quality: Int): File {
    val file = File(outputDir(context), "$prefix-${UUID.randomUUID()}.jpg")
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }
    return file
  }

  /** Full-range BT.601 Y, Cb, Cr planes (same layout as camera YUV frames). */
  fun ycbcr(bmp: Bitmap): Triple<ByteArray, ByteArray, ByteArray> {
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    val y = ByteArray(w * h)
    val cb = ByteArray(w * h)
    val cr = ByteArray(w * h)
    for (i in px.indices) {
      val c = px[i]
      val r = (c shr 16) and 0xff
      val g = (c shr 8) and 0xff
      val b = c and 0xff
      y[i] = ((r * 77 + g * 150 + b * 29) shr 8).toByte()
      cb[i] = (128 + ((-43 * r - 85 * g + 128 * b) shr 8)).coerceIn(0, 255).toByte()
      cr[i] = (128 + ((128 * r - 107 * g - 21 * b) shr 8)).coerceIn(0, 255).toByte()
    }
    return Triple(y, cb, cr)
  }

  /** BT.601 luma of each pixel. */
  fun luminance(bmp: Bitmap): ByteArray {
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    val out = ByteArray(w * h)
    for (i in px.indices) {
      val c = px[i]
      val r = (c shr 16) and 0xff
      val g = (c shr 8) and 0xff
      val b = c and 0xff
      out[i] = ((r * 77 + g * 150 + b * 29) shr 8).toByte()
    }
    return out
  }
}
