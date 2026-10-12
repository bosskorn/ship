package app.onescan.vision

import kotlin.math.max
import kotlin.math.min

/**
 * Keeps an illumination ("paper") grid honest: blocks that aren't paper — much more
 * colourful than the paper (logos, skin, colour print) or very dark (hair, black bars) —
 * are replaced by values diffused from neighbouring paper blocks, so filters don't
 * "correct" them as if they were lighting. Shadows survive: they keep the paper's low
 * chroma and are rarely darker than 45 % of it. Mirror of tools/scanquality/robustgrid.py
 * and `OneScanPaperGrid` (iOS).
 */
internal object PaperGrid {
  private const val CHROMA_MARGIN = 25f
  private const val DARK_RATIO = 0.45f

  /** numpy-style percentile (linear interpolation). */
  fun percentile(values: FloatArray, q: Double): Float {
    if (values.isEmpty()) return 0f
    val s = values.sortedArray()
    val pos = (s.size - 1) * q
    val i = pos.toInt()
    val f = (pos - i).toFloat()
    return if (i + 1 < s.size) s[i] * (1 - f) + s[i + 1] * f else s[i]
  }

  /** [r], [g], [b]: per-block paper estimate (gw × gh, row-major). Updated in place. */
  fun fillNonPaper(r: FloatArray, g: FloatArray, b: FloatArray, gw: Int, gh: Int) {
    val n = gw * gh
    val l = FloatArray(n) { 0.299f * r[it] + 0.587f * g[it] + 0.114f * b[it] }
    val ch = FloatArray(n) { max(r[it], max(g[it], b[it])) - min(r[it], min(g[it], b[it])) }
    val paperL = percentile(l, 0.90)
    val brightCh = (0 until n).filter { l[it] >= 0.8f * paperL }.map { ch[it] }.toFloatArray()
    val paperC = percentile(if (brightCh.isNotEmpty()) brightCh else ch, 0.5)
    var known = BooleanArray(n) { ch[it] <= paperC + CHROMA_MARGIN && l[it] >= DARK_RATIO * paperL }
    if (known.count { it } < 4) return
    repeat(gw + gh) {
      if (known.all { it }) return
      val nr = r.copyOf()
      val ng = g.copyOf()
      val nb = b.copyOf()
      val nk = known.copyOf()
      for (y in 0 until gh) for (x in 0 until gw) {
        val i = y * gw + x
        if (known[i]) continue
        var sr = 0f
        var sg = 0f
        var sb = 0f
        var c = 0
        for (yy in max(0, y - 1)..min(gh - 1, y + 1)) for (xx in max(0, x - 1)..min(gw - 1, x + 1)) {
          val j = yy * gw + xx
          if (known[j]) {
            sr += r[j]; sg += g[j]; sb += b[j]; c++
          }
        }
        if (c > 0) {
          nr[i] = sr / c; ng[i] = sg / c; nb[i] = sb / c; nk[i] = true
        }
      }
      nr.copyInto(r); ng.copyInto(g); nb.copyInto(b)
      known = nk
    }
  }
}
