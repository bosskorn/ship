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

class OutputEdgeTest {
  /** Same cases as masterSize in imageQuality.test.ts. */
  @Test
  fun pixelBudgetMatchesJs() {
    assertEquals(5712, ImageIO.outputEdge(4284, 5712, 0))
    assertEquals(5887, ImageIO.outputEdge(6120, 8160, 0))
    assertEquals(4000, ImageIO.outputEdge(6120, 8160, 4000))
    assertEquals(800, ImageIO.outputEdge(600, 800, 0))
  }
}

class CaptureSizeTest {
  @Test
  fun hdAndMaxPickRealSensorSizes() {
    val binned12 = listOf(4000 to 3000, 4000 to 2250, 3000 to 3000, 1920 to 1080)
    // Only a 12 MP still: HD and MAX are the same size (no camera rebind on switch).
    assertEquals(4000 to 3000, OneScanCameraView.pickSize(binned12, OneScanCameraView.HD_PIXELS))
    assertEquals(4000 to 3000, OneScanCameraView.pickSize(binned12, OneScanCameraView.MAX_PIXELS))
    val fullRes = binned12 + listOf(8160 to 6120, 5664 to 4248)
    // 50 MP sensor: MAX takes the largest 4:3 size under ~26 MP, never the 50 MP one.
    assertEquals(4000 to 3000, OneScanCameraView.pickSize(fullRes, OneScanCameraView.HD_PIXELS))
    assertEquals(5664 to 4248, OneScanCameraView.pickSize(fullRes, OneScanCameraView.MAX_PIXELS))
  }
}
