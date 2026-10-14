package app.onescan.vision

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "Card" filter for ID cards, passports and other colour cards: an enhanced colour scan,
 * never black-and-white. White balance from the card's light, low-chroma areas (partial and
 * bounded, so a genuinely tinted card keeps its colour) → even out the lighting and soften
 * shadows with a capped gain from a dilated illumination map (photos and print aren't
 * mistaken for shadow) → local contrast → levels → a little saturation → mild sharpen.
 * Prototype and tuning: tools/scanquality/cardlook.py.
 *
 * Intermediate values are packed into the pixel array at 10 bits per channel (value × 2,
 * up to 511) so nothing clips before the final levels step.
 */
internal object CardLook {
  private const val WB_MIN = 0.75f
  private const val WB_MAX = 1.4f
  private const val WB_MIX = 0.85f
  private const val GAIN_MIN = 0.85f
  private const val GAIN_MAX = 1.8f
  private const val LOCAL = 0.35f
  private const val SATURATION = 1.12f
  private const val SHARPEN = 0.5f
  private const val Q = 4

  private fun lum(r: Float, g: Float, b: Float) = 0.299f * r + 0.587f * g + 0.114f * b

  private fun pack(r: Float, g: Float, b: Float): Int {
    fun c(v: Float) = (v * 2f).roundToInt().coerceIn(0, 1023)
    return (c(r) shl 20) or (c(g) shl 10) or c(b)
  }
  private fun ur(p: Int) = ((p shr 20) and 1023) / 2f
  private fun ug(p: Int) = ((p shr 10) and 1023) / 2f
  private fun ub(p: Int) = (p and 1023) / 2f

  /** Value at percentile [q] (0..1) of a histogram with [scale] bins per level. */
  private fun percentile(hist: IntArray, total: Long, q: Double, scale: Float = 1f): Float {
    var target = (total * q).toLong()
    for (i in hist.indices) {
      target -= hist[i]
      if (target <= 0) return i / scale
    }
    return (hist.size - 1) / scale
  }

  fun apply(px: IntArray, w: Int, h: Int) {
    val n = px.size
    if (n == 0) return
    // 1. White balance reference: bright (≥ 80th pct), low-chroma (≤ 60th pct of the bright) pixels.
    val lHist = IntArray(256)
    for (c in px) lHist[(((c shr 16) and 0xff) * 77 + ((c shr 8) and 0xff) * 150 + (c and 0xff) * 29) shr 8]++
    val lBright = percentile(lHist, n.toLong(), 0.80).toInt()
    val chHist = IntArray(256)
    var brightCount = 0L
    for (c in px) {
      val r = (c shr 16) and 0xff; val g = (c shr 8) and 0xff; val b = c and 0xff
      if (((r * 77 + g * 150 + b * 29) shr 8) >= lBright) {
        chHist[max(r, max(g, b)) - min(r, min(g, b))]++
        brightCount++
      }
    }
    val chMax = percentile(chHist, brightCount, 0.60).toInt()
    var sr = 0L; var sg = 0L; var sb = 0L; var cnt = 0L
    for (c in px) {
      val r = (c shr 16) and 0xff; val g = (c shr 8) and 0xff; val b = c and 0xff
      if (((r * 77 + g * 150 + b * 29) shr 8) >= lBright && max(r, max(g, b)) - min(r, min(g, b)) <= chMax) {
        sr += r; sg += g; sb += b; cnt++
      }
    }
    val ref = if (cnt > 100) floatArrayOf(sr.toFloat() / cnt, sg.toFloat() / cnt, sb.toFloat() / cnt) else channelPercentiles(px, 0.95)
    val refL = lum(ref[0], ref[1], ref[2])
    val wb = FloatArray(3) { k -> 1f + ((refL / max(ref[k], 1f)).coerceIn(WB_MIN, WB_MAX) - 1f) * WB_MIX }

    // 2–3. Illumination map (90th pct of balanced luminance per block), dilated, smoothed.
    val block = max(8, max(w, h) / 12)
    val gw = (w + block - 1) / block
    val gh = (h + block - 1) / block
    var grid = FloatArray(gw * gh)
    val bh = IntArray(256)
    for (gy in 0 until gh) for (gx in 0 until gw) {
      java.util.Arrays.fill(bh, 0)
      var m = 0L
      var y = gy * block
      while (y < min(h, (gy + 1) * block)) {
        var x = gx * block
        while (x < min(w, (gx + 1) * block)) {
          val c = px[y * w + x]
          bh[lum(((c shr 16) and 0xff) * wb[0], ((c shr 8) and 0xff) * wb[1], (c and 0xff) * wb[2]).roundToInt().coerceIn(0, 255)]++
          m++
          x += 2
        }
        y += 2
      }
      grid[gy * gw + gx] = percentile(bh, m, 0.90)
    }
    grid = dilate(grid, gw, gh)
    repeat(2) { grid = mean3(grid, gw, gh) }
    val target = grid.sortedArray().let { it[min(it.size - 1, (it.size * 0.9).toInt())] }

    // Apply WB × illumination gain; accumulate quarter-res luminance for local contrast.
    val qw = (w + Q - 1) / Q
    val qh = (h + Q - 1) / Q
    val lq = FloatArray(qw * qh)
    val lqn = IntArray(qw * qh)
    for (y in 0 until h) {
      val fy = ((y + 0.5f) / block - 0.5f).coerceIn(0f, (gh - 1).toFloat())
      val y0 = fy.toInt(); val y1 = min(gh - 1, y0 + 1); val ty = fy - y0
      for (x in 0 until w) {
        val fx = ((x + 0.5f) / block - 0.5f).coerceIn(0f, (gw - 1).toFloat())
        val x0 = fx.toInt(); val x1 = min(gw - 1, x0 + 1); val tx = fx - x0
        val illum = (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) +
          (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty
        val gain = (target / max(illum, 1f)).coerceIn(GAIN_MIN, GAIN_MAX)
        val c = px[y * w + x]
        val r = ((c shr 16) and 0xff) * wb[0] * gain
        val g = ((c shr 8) and 0xff) * wb[1] * gain
        val b = (c and 0xff) * wb[2] * gain
        px[y * w + x] = pack(r, g, b)
        val qi = (y / Q) * qw + x / Q
        lq[qi] += lum(r, g, b)
        lqn[qi]++
      }
    }
    for (i in lq.indices) lq[i] /= max(1, lqn[i])

    // 4. Local contrast: L + LOCAL × (L − blurred L); blur at quarter resolution.
    val rq = max(1, max(w, h) / 60 / Q)
    val blur = boxBlur(boxBlur(lq, qw, qh, rq), qw, qh, rq)
    val hist = IntArray(1024)
    for (y in 0 until h) {
      val fy = ((y + 0.5f) / Q - 0.5f).coerceIn(0f, (qh - 1).toFloat())
      val y0 = fy.toInt(); val y1 = min(qh - 1, y0 + 1); val ty = fy - y0
      for (x in 0 until w) {
        val fx = ((x + 0.5f) / Q - 0.5f).coerceIn(0f, (qw - 1).toFloat())
        val x0 = fx.toInt(); val x1 = min(qw - 1, x0 + 1); val tx = fx - x0
        val lb = (blur[y0 * qw + x0] * (1 - tx) + blur[y0 * qw + x1] * tx) * (1 - ty) +
          (blur[y1 * qw + x0] * (1 - tx) + blur[y1 * qw + x1] * tx) * ty
        val p = px[y * w + x]
        val r = ur(p); val g = ug(p); val b = ub(p)
        val d = LOCAL * (lum(r, g, b) - lb)
        val np = pack(r + d, g + d, b + d)
        px[y * w + x] = np
        hist[(lum(ur(np), ug(np), ub(np)) * 2).roundToInt().coerceIn(0, 1023)]++
      }
    }

    // 5. Levels (luminance-based, same for all channels) + saturation → final ARGB.
    val lo = min(percentile(hist, n.toLong(), 0.005, 2f), 60f)
    val hi = max(percentile(hist, n.toLong(), 0.995, 2f), 180f)
    val k = 248f / max(1f, hi - lo)
    for (i in 0 until n) {
      val p = px[i]
      val r = (ur(p) - lo) * k
      val g = (ug(p) - lo) * k
      val b = (ub(p) - lo) * k
      val l = lum(r, g, b)
      px[i] = (0xff shl 24) or
        ((l + (r - l) * SATURATION).roundToInt().coerceIn(0, 255) shl 16) or
        ((l + (g - l) * SATURATION).roundToInt().coerceIn(0, 255) shl 8) or
        (l + (b - l) * SATURATION).roundToInt().coerceIn(0, 255)
    }
    // 6. Mild sharpen.
    PageProcessor.unsharpRows(px, w, h, SHARPEN)
  }

  private fun channelPercentiles(px: IntArray, q: Double): FloatArray {
    val hs = Array(3) { IntArray(256) }
    for (c in px) {
      hs[0][(c shr 16) and 0xff]++; hs[1][(c shr 8) and 0xff]++; hs[2][c and 0xff]++
    }
    return FloatArray(3) { percentile(hs[it], px.size.toLong(), q) }
  }

  private fun dilate(g: FloatArray, gw: Int, gh: Int) = FloatArray(g.size) { i ->
    val x = i % gw; val y = i / gw
    var m = g[i]
    for (dy in -1..1) for (dx in -1..1) {
      val yy = (y + dy).coerceIn(0, gh - 1); val xx = (x + dx).coerceIn(0, gw - 1)
      m = max(m, g[yy * gw + xx])
    }
    m
  }

  private fun mean3(g: FloatArray, gw: Int, gh: Int) = FloatArray(g.size) { i ->
    val x = i % gw; val y = i / gw
    var s = 0f
    for (dy in -1..1) for (dx in -1..1) s += g[(y + dy).coerceIn(0, gh - 1) * gw + (x + dx).coerceIn(0, gw - 1)]
    s / 9f
  }

  /** Mean over a (2r+1)² window, edges clamped (separable). */
  private fun boxBlur(src: FloatArray, w: Int, h: Int, r: Int): FloatArray {
    val tmp = FloatArray(src.size)
    val out = FloatArray(src.size)
    val n = 2 * r + 1
    for (y in 0 until h) for (x in 0 until w) {
      var s = 0f
      for (d in -r..r) s += src[y * w + (x + d).coerceIn(0, w - 1)]
      tmp[y * w + x] = s / n
    }
    for (y in 0 until h) for (x in 0 until w) {
      var s = 0f
      for (d in -r..r) s += tmp[(y + d).coerceIn(0, h - 1) * w + x]
      out[y * w + x] = s / n
    }
    return out
  }
}
