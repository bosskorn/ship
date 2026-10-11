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

  fun saveJpeg(context: Context, bmp: Bitmap, prefix: String, quality: Int = 88): File {
    val file = File(outputDir(context), "$prefix-${UUID.randomUUID()}.jpg")
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }
    return file
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
