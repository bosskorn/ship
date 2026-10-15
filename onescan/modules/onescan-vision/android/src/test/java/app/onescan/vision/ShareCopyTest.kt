package app.onescan.vision

import java.io.File
import java.io.RandomAccessFile
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** Share copies: own folder per share, never the reusable plain cache, removed only once old enough. */
class ShareCopyTest {
  private lateinit var dir: File
  private lateinit var share: File
  private val data = ByteArray(200_000) { (it * 7 + 3).toByte() }
  private val minute = 60_000L

  @Before
  fun setUp() {
    dir = createTempDir("sharecopy")
    share = File(dir, "share")
    SecureFiles.useKeyForTests(SecretKeySpec(ByteArray(32) { it.toByte() }, "AES"))
  }

  private fun encrypted(): File {
    val src = File(dir, "doc.src").apply { writeBytes(data) }
    return File(dir, "document.pdf").also { SecureFiles.encrypt(src, it); src.delete() }
  }

  private fun folders() = share.listFiles()?.size ?: 0

  @Test fun encryptedSourceIsDecryptedIntoItsOwnNamedFolder() {
    val enc = encrypted()
    val out = SecureFiles.shareCopy(enc, "Receipt 15/10.pdf", share, now = 1_000)
    assertArrayEquals(data, out.readBytes())
    assertEquals("Receipt 15 10.pdf", out.name)
    assertEquals(share, out.parentFile!!.parentFile)
    assertTrue(SecureFiles.isEncrypted(enc))
  }

  @Test fun everyShareGetsANewCopy() {
    val enc = encrypted()
    val a = SecureFiles.shareCopy(enc, "A.pdf", share, now = 1_000)
    val b = SecureFiles.shareCopy(enc, "A.pdf", share, now = 1_000)
    assertNotEquals(a.parentFile, b.parentFile)
    assertEquals(2, folders())
  }

  @Test fun plaintextSourceIsCopiedNotMoved() {
    val plain = File(dir, "plain.pdf").apply { writeBytes(data) }
    val out = SecureFiles.shareCopy(plain, "P.pdf", share, now = 1_000)
    assertTrue(plain.exists())
    assertArrayEquals(data, out.readBytes())
  }

  @Test fun aFailedDecryptLeavesNoFolder() {
    val enc = encrypted()
    RandomAccessFile(enc, "rw").use { f -> f.seek(4000); val v = f.read(); f.seek(4000); f.write(v xor 1) }
    try {
      SecureFiles.shareCopy(enc, "T.pdf", share, now = 1_000)
      fail("should throw")
    } catch (_: Exception) {
    }
    assertEquals(0, folders())
  }

  @Test fun sweepRemovesOnlyCopiesOlderThanTheMinimumAge() {
    val enc = encrypted()
    val now = 100 * minute
    val old = SecureFiles.shareCopy(enc, "old.pdf", share, now = now - 20 * minute)
    val young = SecureFiles.shareCopy(enc, "young.pdf", share, now = now - 2 * minute)
    assertEquals(1, SecureFiles.sweepShareCopies(15 * minute, share, now))
    assertFalse(old.exists())
    assertFalse(old.parentFile!!.exists())
    assertTrue(young.exists())
    assertEquals(1, SecureFiles.sweepShareCopies(0, share, now))
    assertEquals(0, folders())
  }

  @Test fun undatedOrFutureFoldersFallBackToLastModified() {
    val now = 100 * minute
    val undated = File(share, "stray").apply { mkdirs(); File(this, "x.pdf").writeBytes(data) }
    val future = File(share, "${now + 60 * minute}-abc").apply { mkdirs(); File(this, "y.pdf").writeBytes(data) }
    undated.setLastModified(now - 30 * minute)
    future.setLastModified(now - 30 * minute)
    assertEquals(2, SecureFiles.sweepShareCopies(15 * minute, share, now))
    assertEquals(0, folders())
  }

  @Test fun sweepOfAMissingFolderIsANoOp() {
    assertEquals(0, SecureFiles.sweepShareCopies(0, File(dir, "none"), 1_000))
  }
}
