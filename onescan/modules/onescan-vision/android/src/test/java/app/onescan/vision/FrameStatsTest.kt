package app.onescan.vision

import org.junit.Assert.assertEquals
import org.junit.Test

class FrameStatsTest {
  /** Same pattern and expected numbers as `sharpnessOf` in quadDetector.ts (JS reference). */
  @Test
  fun matchesJsReference() {
    val w = 48
    val h = 36
    val y = ByteArray(w * h) { i -> ((i * 73 + (i / w) * 29) % 7 + 120).toByte() }
    assertEquals(0.06306037045127662, FrameStats.sharpness(y, w, h), 1e-12)
    assertEquals(0.48235067175018154, FrameStats.brightness(y), 1e-12)
  }

  @Test
  fun flatFrameHasNoSharpness() {
    val y = ByteArray(20 * 20) { 200.toByte() }
    assertEquals(0.0, FrameStats.sharpness(y, 20, 20), 0.0)
    assertEquals(200.0 / 255.0, FrameStats.brightness(y), 1e-12)
  }
}
