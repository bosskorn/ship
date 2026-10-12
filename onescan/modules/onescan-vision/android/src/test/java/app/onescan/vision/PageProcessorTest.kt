package app.onescan.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pixel algorithms run on plain IntArrays, so they are testable on the JVM. */
class PageProcessorTest {
  private fun gray(v: Int) = (0xff shl 24) or (v shl 16) or (v shl 8) or v
  private fun lum(c: Int) = (((c shr 16) and 0xff) * 77 + ((c shr 8) and 0xff) * 150 + (c and 0xff) * 29) shr 8

  /** White paper lit from the left (shadow on the right) with a dark text stroke. */
  private fun shadowedPage(w: Int, h: Int): IntArray {
    val px = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
      val paper = 240 - (x * 140 / w) // 240 → 100 across the page
      val isText = y in (h / 2 - 2)..(h / 2 + 2) && x % 20 < 14
      px[y * w + x] = gray(if (isText) paper / 4 else paper)
    }
    return px
  }

  @Test
  fun normalizeIlluminationFlattensShadowsAndKeepsText() {
    val w = 400
    val h = 300
    val px = shadowedPage(w, h)
    val leftBefore = lum(px[10 * w + 20])
    val rightBefore = lum(px[10 * w + w - 20])
    assertTrue(leftBefore - rightBefore > 100)

    PageProcessor.normalizeIllumination(px, w, h, strength = 1.0)

    val left = lum(px[10 * w + 20])
    val right = lum(px[10 * w + w - 20])
    assertTrue("paper should be evenly bright: $left vs $right", kotlin.math.abs(left - right) < 25)
    assertTrue("paper should be near white: $right", right > 200)
    val textRight = lum(px[(h / 2) * w + (w - 40)])
    assertTrue("text in the shadow must stay dark: $textRight", textRight < 110)
  }

  @Test
  fun bwThresholdProducesPureBlackAndWhite() {
    val w = 400
    val h = 300
    val px = shadowedPage(w, h)
    PageProcessor.normalizeIllumination(px, w, h, strength = 1.0)
    PageProcessor.threshold(px)
    assertTrue(px.all { it == 0xffffffff.toInt() || it == 0xff000000.toInt() })
    assertEquals(0xffffffff.toInt(), px[10 * w + w - 20]) // shadowed paper → white
    assertEquals(0xff000000.toInt(), px[(h / 2) * w + (w - 40)]) // shadowed text → black
  }

  @Test
  fun adjustWithZeroSaturationProducesGray() {
    val px = intArrayOf((0xff shl 24) or (200 shl 16) or (50 shl 8) or 10)
    PageProcessor.adjust(px, contrast = 1.0, saturation = 0.0, brightness = 0.0)
    val c = px[0]
    val r = (c shr 16) and 0xff
    val g = (c shr 8) and 0xff
    val b = c and 0xff
    assertEquals(r, g)
    assertEquals(g, b)
  }

  @Test
  fun scanLookGivesWhitePaperDarkTextAndKeepsColour() {
    val w = 400
    val h = 300
    // Warm-tinted paper under a lamp, shadow across, text strokes, and a red stamp.
    val px = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
      val light = 1.0 - 0.45 * x / w
      val isText = y in 140..146 && x % 20 < 12
      val isStamp = x in 40..80 && y in 40..80
      val (r, g, b) = when {
        isText -> Triple(60, 55, 50)
        isStamp -> Triple(200, 40, 40)
        else -> Triple(235, 222, 195)
      }
      px[y * w + x] = (0xff shl 24) or ((r * light).toInt() shl 16) or ((g * light).toInt() shl 8) or (b * light).toInt()
    }
    PageProcessor.scanLook(px, w, h)
    fun ch(c: Int, s: Int) = (c shr s) and 0xff
    for (x in intArrayOf(20, 200, 380)) {
      val c = px[20 * w + x]
      assertTrue("paper should be white at x=$x: ${lum(c)}", lum(c) > 240)
      assertTrue("paper tint removed at x=$x", kotlin.math.abs(ch(c, 16) - ch(c, 0)) < 12)
    }
    val text = px[143 * w + 365]
    assertTrue("text in the shadow should be dark: ${lum(text)}", lum(text) < 90)
    val stamp = px[60 * w + 60]
    assertTrue("stamp keeps its red: $stamp", ch(stamp, 16) - ch(stamp, 8) > 100)
  }
}
