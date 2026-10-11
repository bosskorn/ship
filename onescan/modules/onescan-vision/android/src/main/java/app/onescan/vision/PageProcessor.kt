package app.onescan.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import java.io.File
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Page pipeline (spec §13): perspective correction → crop → rotate →
 * enhance (illumination/shadow normalisation, contrast) → filter.
 */
internal object PageProcessor {
  private const val WORK_EDGE = 3200
  private const val MAX_OUTPUT_EDGE = 2480 // ~A4 long edge at 300 dpi

  data class Result(val file: File, val width: Int, val height: Int)

  fun process(context: Context, source: File, quad: List<DoubleArray>?, filter: String, rotation: Int): Result {
    var bmp = ImageIO.loadUpright(source, WORK_EDGE)
    if (quad != null && quad.size == 4) bmp = warp(bmp, quad)
    bmp = ImageIO.rotate(bmp, rotation)
    bmp = capEdge(bmp, MAX_OUTPUT_EDGE)
    bmp = applyFilter(bmp, filter)
    val file = ImageIO.saveJpeg(context, bmp, "page")
    val r = Result(file, bmp.width, bmp.height)
    bmp.recycle()
    return r
  }

  private fun capEdge(bmp: Bitmap, edge: Int): Bitmap {
    val long = max(bmp.width, bmp.height)
    if (long <= edge) return bmp
    val s = edge.toFloat() / long
    val out = Bitmap.createScaledBitmap(bmp, (bmp.width * s).roundToInt(), (bmp.height * s).roundToInt(), true)
    if (out != bmp) bmp.recycle()
    return out
  }

  /** Quad is normalised TL, TR, BR, BL. Output size follows the page's edge lengths. */
  fun warp(src: Bitmap, quad: List<DoubleArray>): Bitmap {
    val w = src.width.toDouble()
    val h = src.height.toDouble()
    val p = quad.map { doubleArrayOf(it[0].coerceIn(0.0, 1.0) * w, it[1].coerceIn(0.0, 1.0) * h) }
    fun dist(a: DoubleArray, b: DoubleArray) = hypot(a[0] - b[0], a[1] - b[1])
    val outW = max(dist(p[0], p[1]), dist(p[3], p[2])).roundToInt().coerceAtLeast(16)
    val outH = max(dist(p[0], p[3]), dist(p[1], p[2])).roundToInt().coerceAtLeast(16)
    val srcPts = floatArrayOf(
      p[0][0].toFloat(), p[0][1].toFloat(), p[1][0].toFloat(), p[1][1].toFloat(),
      p[2][0].toFloat(), p[2][1].toFloat(), p[3][0].toFloat(), p[3][1].toFloat(),
    )
    val dstPts = floatArrayOf(0f, 0f, outW.toFloat(), 0f, outW.toFloat(), outH.toFloat(), 0f, outH.toFloat())
    val m = Matrix()
    if (!m.setPolyToPoly(srcPts, 0, dstPts, 0, 4)) return src
    val out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
    Canvas(out).apply {
      drawColor(Color.WHITE)
      drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    }
    src.recycle()
    return out
  }

  fun applyFilter(bmp: Bitmap, filter: String): Bitmap {
    if (filter == "original") return bmp
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    when (filter) {
      "auto" -> {
        normalizeIllumination(px, w, h, strength = 0.7)
        adjust(px, contrast = 1.08, saturation = 1.05, brightness = 0.0)
      }
      "document" -> {
        normalizeIllumination(px, w, h, strength = 1.0)
        adjust(px, contrast = 1.3, saturation = 0.8, brightness = 4.0)
      }
      "color" -> adjust(px, contrast = 1.12, saturation = 1.35, brightness = 0.0)
      "gray" -> {
        normalizeIllumination(px, w, h, strength = 0.6)
        adjust(px, contrast = 1.12, saturation = 0.0, brightness = 0.0)
      }
      "bw" -> {
        normalizeIllumination(px, w, h, strength = 1.0)
        threshold(px)
      }
    }
    val out = if (bmp.isMutable) bmp else bmp.copy(Bitmap.Config.ARGB_8888, true).also { bmp.recycle() }
    out.setPixels(px, 0, w, 0, 0, w, h)
    return out
  }

  /**
   * Shadow / uneven-lighting removal: estimate the paper colour per block
   * (bright percentile, so dark text is ignored), smooth it, then divide.
   */
  fun normalizeIllumination(px: IntArray, w: Int, h: Int, strength: Double) {
    val block = max(16, max(w, h) / 40)
    val gw = (w + block - 1) / block
    val gh = (h + block - 1) / block
    val bg = Array(3) { FloatArray(gw * gh) }
    val hist = IntArray(256)
    for (gy in 0 until gh) for (gx in 0 until gw) {
      val x0 = gx * block
      val y0 = gy * block
      val x1 = min(w, x0 + block)
      val y1 = min(h, y0 + block)
      for (c in 0 until 3) {
        java.util.Arrays.fill(hist, 0)
        var n = 0
        var y = y0
        while (y < y1) {
          var x = x0
          while (x < x1) {
            hist[(px[y * w + x] shr (16 - 8 * c)) and 0xff]++
            n++
            x += 2
          }
          y += 2
        }
        // 90th percentile ≈ paper brightness in this block.
        var target = (n * 0.9).toInt()
        var v = 255
        for (i in 0 until 256) {
          target -= hist[i]
          if (target <= 0) {
            v = i
            break
          }
        }
        bg[c][gy * gw + gx] = max(v, 24).toFloat()
      }
    }
    // Smooth the grid (3×3 mean, twice) to avoid block seams.
    repeat(2) {
      for (c in 0 until 3) {
        val src = bg[c].copyOf()
        for (gy in 0 until gh) for (gx in 0 until gw) {
          var s = 0f
          var n = 0
          for (dy in -1..1) for (dx in -1..1) {
            val yy = gy + dy
            val xx = gx + dx
            if (yy in 0 until gh && xx in 0 until gw) {
              s += src[yy * gw + xx]
              n++
            }
          }
          bg[c][gy * gw + gx] = s / n
        }
      }
    }
    for (y in 0 until h) {
      val fy = ((y + 0.5f) / block - 0.5f).coerceIn(0f, (gh - 1).toFloat())
      val y0 = fy.toInt()
      val y1 = min(gh - 1, y0 + 1)
      val ty = fy - y0
      for (x in 0 until w) {
        val fx = ((x + 0.5f) / block - 0.5f).coerceIn(0f, (gw - 1).toFloat())
        val x0 = fx.toInt()
        val x1 = min(gw - 1, x0 + 1)
        val tx = fx - x0
        val i = y * w + x
        val c = px[i]
        var out = c and (0xff shl 24)
        for (ch in 0 until 3) {
          val g = bg[ch]
          val b = (g[y0 * gw + x0] * (1 - tx) + g[y0 * gw + x1] * tx) * (1 - ty) +
            (g[y1 * gw + x0] * (1 - tx) + g[y1 * gw + x1] * tx) * ty
          val shift = 16 - 8 * ch
          val v = ((c shr shift) and 0xff).toFloat()
          val norm = min(255f, v * 245f / b)
          val mixed = (v + (norm - v) * strength).roundToInt().coerceIn(0, 255)
          out = out or (mixed shl shift)
        }
        px[i] = out
      }
    }
  }

  fun adjust(px: IntArray, contrast: Double, saturation: Double, brightness: Double) {
    for (i in px.indices) {
      val c = px[i]
      var r = ((c shr 16) and 0xff).toDouble()
      var g = ((c shr 8) and 0xff).toDouble()
      var b = (c and 0xff).toDouble()
      val l = 0.299 * r + 0.587 * g + 0.114 * b
      r = l + (r - l) * saturation
      g = l + (g - l) * saturation
      b = l + (b - l) * saturation
      r = (r - 128) * contrast + 128 + brightness
      g = (g - 128) * contrast + 128 + brightness
      b = (b - 128) * contrast + 128 + brightness
      px[i] = (c and (0xff shl 24)) or
        (r.roundToInt().coerceIn(0, 255) shl 16) or
        (g.roundToInt().coerceIn(0, 255) shl 8) or
        b.roundToInt().coerceIn(0, 255)
    }
  }

  /** Otsu binarisation on illumination-normalised luminance. */
  fun threshold(px: IntArray) {
    val lum = IntArray(px.size)
    val hist = IntArray(256)
    for (i in px.indices) {
      val c = px[i]
      val l = (((c shr 16) and 0xff) * 77 + ((c shr 8) and 0xff) * 150 + (c and 0xff) * 29) shr 8
      lum[i] = l
      hist[l]++
    }
    val total = px.size.toDouble()
    var sum = 0.0
    for (i in 0 until 256) sum += i * hist[i].toDouble()
    var sumB = 0.0
    var wB = 0.0
    var best = 0.0
    var t = 160
    for (i in 0 until 256) {
      wB += hist[i]
      if (wB == 0.0) continue
      val wF = total - wB
      if (wF == 0.0) break
      sumB += i * hist[i].toDouble()
      val mB = sumB / wB
      val mF = (sum - sumB) / wF
      val between = wB * wF * (mB - mF) * (mB - mF)
      if (between > best) {
        best = between
        t = i
      }
    }
    for (i in px.indices) px[i] = if (lum[i] > t) Color.WHITE else Color.BLACK
  }
}
