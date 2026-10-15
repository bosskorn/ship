package app.onescan.vision

import java.io.File
import java.io.RandomAccessFile
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** OCR's decrypted copy lives only for the call: no plaintext left after success, failure or interruption. */
class PlainTempTest {
  private lateinit var dir: File
  private lateinit var scoped: File
  private val data = ByteArray(300_000) { (it * 13 + 5).toByte() }

  @Before
  fun setUp() {
    dir = createTempDir("plaintemp")
    scoped = File(dir, "scoped")
    SecureFiles.useKeyForTests(SecretKeySpec(ByteArray(32) { it.toByte() }, "AES"))
  }

  private fun encrypted(): File {
    val src = File(dir, "page.src").apply { writeBytes(data) }
    return File(dir, "page-1.jpg").also { SecureFiles.encrypt(src, it); src.delete() }
  }

  private fun leftovers() = scoped.listFiles()?.size ?: 0

  @Test fun successReadsPlaintextThenDeletesIt() {
    var seen: File? = null
    val n = SecureFiles.withPlainTemp(encrypted(), scoped) { f ->
      seen = f
      assertArrayEquals(data, f.readBytes())
      f.length()
    }
    assertEquals(data.size.toLong(), n)
    assertFalse(seen!!.exists())
    assertEquals(0, leftovers())
  }

  @Test fun failureDeletesThePlaintext() {
    try {
      SecureFiles.withPlainTemp(encrypted(), scoped) { throw IllegalStateException("Tesseract init failed") }
      fail("should throw")
    } catch (e: IllegalStateException) {
      assertEquals("Tesseract init failed", e.message)
    }
    assertEquals(0, leftovers())
  }

  @Test fun interruptionDeletesThePlaintext() {
    try {
      SecureFiles.withPlainTemp(encrypted(), scoped) { throw InterruptedException("cancelled") }
      fail("should throw")
    } catch (_: InterruptedException) {
    }
    assertEquals(0, leftovers())
  }

  @Test fun aFileThatFailsToDecryptLeavesNothing() {
    val enc = encrypted()
    RandomAccessFile(enc, "rw").use { f -> f.seek(5000); val b = f.read(); f.seek(5000); f.write(b xor 1) }
    try {
      SecureFiles.withPlainTemp(enc, scoped) { fail("block must not run on a tampered file") }
      fail("should throw")
    } catch (_: Exception) {
    }
    assertEquals(0, leftovers())
  }

  @Test fun plaintextInputIsPassedThroughAndNeverDeleted() {
    val plain = File(dir, "capture.jpg").apply { writeBytes(data) }
    val seen = SecureFiles.withPlainTemp(plain, scoped) { it }
    assertEquals(plain, seen)
    assertTrue(plain.exists())
    assertArrayEquals(data, plain.readBytes())
    assertEquals(0, leftovers())
  }

  @Test fun concurrentCallsGetSeparateCopies() {
    val enc = encrypted()
    val names = (1..4).map { SecureFiles.withPlainTemp(enc, scoped) { f -> f.name } }
    assertEquals(4, names.toSet().size)
    assertEquals(0, leftovers())
  }
}
