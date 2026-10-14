package app.onescan.vision

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Coloured ink through the default scan look: thin red stamp strokes (bright, dark, faded,
 * under a warm lamp, over text), blue signatures and highlighter must keep their colour —
 * never turn black, never wash out to white.
 */
class ColourInkTest {
  private fun ch(c: Int, s: Int) = (c shr s) and 0xff
  private fun r(c: Int) = ch(c, 16)
  private fun g(c: Int) = ch(c, 8)
  private fun b(c: Int) = ch(c, 0)

  private data class Ink(val name: String, val rgb: Triple<Int, Int, Int>)

  /** Page with a stamp ring (2–3 px strokes) + stamp letters, a signature line, highlighted text. */
  private fun page(w: Int, h: Int, stamp: Triple<Int, Int, Int>, light: (Int, Int) -> Double, paper: Triple<Int, Int, Int>): IntArray {
    val px = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
      val dx = x - 120.0
      val dy = y - 120.0
      val d = kotlin.math.sqrt(dx * dx + dy * dy)
      val ring = d in 58.0..61.0 || d in 48.0..50.0
      val letters = y in 112..128 && x in 85..155 && (x % 9 < 2 || y % 8 < 2)
      val bodyText = y in 200..204 && x % 16 < 10
      val sig = y in 300..302 && x in 60..340 && ((x / 7) % 3 != 0)
      val hiText = y in 380..383 && x in 60..340 && x % 14 < 9
      val hi = y in 372..390 && x in 50..350
      val (cr, cg, cb) = when {
        ring || letters -> stamp
        bodyText -> Triple(40, 40, 45)
        sig -> Triple(30, 60, 170)
        hiText -> Triple(45, 45, 40)
        hi -> Triple(250, 238, 90)
        else -> paper
      }
      val l = light(x, y)
      px[y * w + x] = (0xff shl 24) or ((cr * l).toInt().coerceIn(0, 255) shl 16) or ((cg * l).toInt().coerceIn(0, 255) shl 8) or (cb * l).toInt().coerceIn(0, 255)
    }
    return px
  }

  private fun checkStamp(px: IntArray, w: Int, label: String) {
    // Every stroke pixel of the outer ring: clearly red, not black, not white.
    var n = 0
    var bad = 0
    var worst = ""
    for (a in 0 until 360 step 5) {
      val t = Math.toRadians(a.toDouble())
      val x = (120 + 59.5 * kotlin.math.cos(t)).toInt()
      val y = (120 + 59.5 * kotlin.math.sin(t)).toInt()
      val c = px[y * w + x]
      n++
      val red = r(c) - maxOf(g(c), b(c)) > 60
      val notBlack = r(c) > 110
      val notWhite = minOf(g(c), b(c)) < 200
      if (!(red && notBlack && notWhite)) {
        bad++
        worst = "(${r(c)},${g(c)},${b(c)})"
      }
    }
    assertTrue("$label: red stamp ring lost colour on $bad/$n samples, e.g. $worst", bad <= n / 20)
  }

  private val paper = Triple(238, 232, 220)
  private val even = { _: Int, _: Int -> 1.0 }

  @Test
  fun stampInksStayRed() {
    val w = 400
    val h = 420
    for (ink in listOf(
      Ink("bright red", Triple(205, 35, 40)),
      Ink("dark red", Triple(150, 25, 35)),
      Ink("faded red", Triple(225, 125, 125)),
      Ink("vermilion seal", Triple(220, 70, 40)),
    )) {
      val px = page(w, h, ink.rgb, even, paper)
      PageProcessor.scanLook(px, w, h)
      checkStamp(px, w, ink.name)
      // Not darkened towards black (the luminance-ratio tone curve on the QA branch did this):
      // the ring's luminance stays within 15 levels of the ink's, or brighter.
      val (ir, ig, ib) = ink.rgb
      val inkL = 0.299 * ir + 0.587 * ig + 0.114 * ib
      val c = px[120 * w + (120 + 59)]
      val outL = 0.299 * r(c) + 0.587 * g(c) + 0.114 * b(c)
      assertTrue("${ink.name}: stamp darkened ${"%.0f".format(inkL)} -> ${"%.0f".format(outL)}", outL >= inkL - 15)
    }
  }

  @Test
  fun stampStaysRedUnderWarmLampAndShadow() {
    val w = 400
    val h = 420
    val lamp = { x: Int, _: Int -> 1.0 - 0.5 * x / w }
    val px = page(w, h, Triple(200, 40, 45), lamp, Triple(240, 220, 180))
    PageProcessor.scanLook(px, w, h)
    checkStamp(px, w, "warm lamp + shadow")
  }

  @Test
  fun signatureStaysBlueAndHighlighterStaysYellow() {
    val w = 400
    val h = 420
    val px = page(w, h, Triple(205, 35, 40), even, paper)
    PageProcessor.scanLook(px, w, h)
    var blue = 0
    var n = 0
    for (x in 61..339) {
      if ((x / 7) % 3 == 0) continue
      val c = px[301 * w + x]
      n++
      if (b(c) - maxOf(r(c), g(c)) > 50 && b(c) > 90) blue++
    }
    assertTrue("signature stays blue: $blue/$n", blue >= n * 0.9)
    val h1 = px[376 * w + 200]
    assertTrue("highlighter stays yellow: (${r(h1)},${g(h1)},${b(h1)})", r(h1) > 200 && g(h1) > 190 && b(h1) < 170)
    val t = px[381 * w + 62]
    assertTrue("text under highlighter stays dark: (${r(t)},${g(t)},${b(t)})", (r(t) + g(t) + b(t)) / 3 < 110)
  }
}
