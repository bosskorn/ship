package app.onescan.vision

import kotlin.math.min

/**
 * Per-frame capture-quality numbers, computed on the camera's analysis thread so the JS
 * thread never walks frame pixels. Mirrors `sharpnessOf` in quadDetector.ts (and
 * ios/FrameStats.swift) exactly.
 */
object FrameStats {
  /** Mean luminance 0..1. */
  fun brightness(y: ByteArray): Double {
    if (y.isEmpty()) return 0.0
    var sum = 0L
    for (b in y) sum += (b.toInt() and 0xff)
    return sum.toDouble() / y.size / 255.0
  }

  /** Variance of the Laplacian mapped to 0..1 (calibrated on ~180×240 frames). */
  fun sharpness(y: ByteArray, w: Int, h: Int): Double {
    var n = 0
    var mean = 0.0
    var m2 = 0.0
    for (yy in 1 until h - 1) {
      for (x in 1 until w - 1) {
        val i = yy * w + x
        val lap = (4 * (y[i].toInt() and 0xff) - (y[i - 1].toInt() and 0xff) - (y[i + 1].toInt() and 0xff) -
          (y[i - w].toInt() and 0xff) - (y[i + w].toInt() and 0xff)).toDouble()
        n++
        val d = lap - mean
        mean += d / n
        m2 += d * (lap - mean)
      }
    }
    val variance = if (n > 1) m2 / (n - 1) else 0.0
    return min(1.0, variance / 2000.0)
  }
}
