package app.onescan.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The Kotlin runtime must reproduce the PyTorch model: same weights, same input →
 * same logits (`tools/docseg/export.py` writes the parity vector).
 */
class DocSegTest {
  private val weights = File("src/main/assets/docseg.bin").readBytes()
  private val parity = File("src/test/resources/docseg_parity.bin").readBytes()

  @Test
  fun matchesReferenceLogits() {
    val model = DocSeg(DocSeg.parse(weights))
    val n = DocSeg.INPUT * DocSeg.INPUT
    val y = parity.copyOfRange(0, n)
    val cb = parity.copyOfRange(n, 2 * n)
    val cr = parity.copyOfRange(2 * n, 3 * n)
    val expected = ByteBuffer.wrap(parity, 3 * n, parity.size - 3 * n).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    // Input already at model size: the resize is the identity.
    val logits = model.logits(model.input(y, cb, cr, DocSeg.INPUT, DocSeg.INPUT))
    assertEquals(DocSeg.MASK * DocSeg.MASK, logits.size)
    var maxErr = 0f
    var agree = 0
    for (k in logits.indices) {
      val e = expected.get(k)
      maxErr = maxOf(maxErr, kotlin.math.abs(logits[k] - e))
      if ((logits[k] > 0) == (e > 0)) agree++
    }
    assertTrue("max logit error $maxErr", maxErr < 1e-2f)
    assertEquals(logits.size, agree)
  }

  @Test
  fun maskIsAPageOnTheSyntheticScene() {
    val model = DocSeg(DocSeg.parse(weights))
    val n = DocSeg.INPUT * DocSeg.INPUT
    val m = model.mask(parity.copyOfRange(0, n), parity.copyOfRange(n, 2 * n), parity.copyOfRange(2 * n, 3 * n), DocSeg.INPUT, DocSeg.INPUT)
    val on = m.count { (it.toInt() and 0xff) > 127 }
    assertTrue("page should cover a large part of the mask: $on", on in 1000..3000)
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsCorruptWeights() {
    DocSeg.parse(byteArrayOf(1, 2, 3, 4, 0, 0, 0, 0))
  }
}
