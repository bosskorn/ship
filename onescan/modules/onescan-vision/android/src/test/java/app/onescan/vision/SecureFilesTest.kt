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

class SecureFilesTest {
  private lateinit var dir: File

  @Before
  fun setUp() {
    dir = createTempDir("securefiles")
    SecureFiles.useKeyForTests(SecretKeySpec(ByteArray(32) { it.toByte() }, "AES"))
  }

  private fun bytes(n: Int) = ByteArray(n) { (it * 31 + 7).toByte() }

  private fun roundTrip(n: Int) {
    val src = File(dir, "src-$n.jpg").apply { writeBytes(bytes(n)) }
    val enc = File(dir, "enc-$n.jpg")
    val out = File(dir, "out-$n.jpg")
    SecureFiles.encrypt(src, enc)
    assertTrue(SecureFiles.isEncrypted(enc))
    assertFalse(SecureFiles.isEncrypted(src))
    SecureFiles.decrypt(enc, out)
    assertArrayEquals(src.readBytes(), out.readBytes())
  }

  @Test fun roundTripsEmptySmallAndMultiChunkFiles() {
    for (n in listOf(0, 1, 4096, (1 shl 20) - 1, 1 shl 20, (1 shl 20) + 1, 3 * (1 shl 20) + 12345)) roundTrip(n)
  }

  @Test fun detectsTamperingAndTruncation() {
    val src = File(dir, "a.pdf").apply { writeBytes(bytes(2 * (1 shl 20) + 100)) }
    val enc = File(dir, "a.enc")
    SecureFiles.encrypt(src, enc)
    // flip one ciphertext byte in the second record
    val flipped = File(dir, "flipped.enc").apply { writeBytes(enc.readBytes()) }
    RandomAccessFile(flipped, "rw").use { f -> f.seek((1 shl 20) + 200L); val b = f.read(); f.seek((1 shl 20) + 200L); f.write(b xor 1) }
    expectFailure { SecureFiles.decrypt(flipped, File(dir, "x")) }
    // drop the last record (truncation must not decrypt to a shorter file)
    val cut = File(dir, "cut.enc").apply { writeBytes(enc.readBytes().copyOf((enc.length() - 150).toInt())) }
    expectFailure { SecureFiles.decrypt(cut, File(dir, "y")) }
    assertFalse("no partial output", File(dir, "x").exists() || File(dir, "y").exists())
  }

  @Test fun migratesInPlaceOnceAndCopiesEncryptedFilesAsIs() {
    val f = File(dir, "page-1.jpg").apply { writeBytes(bytes(500_000)) }
    val original = f.readBytes()
    assertTrue(SecureFiles.migrate(f))
    assertTrue(SecureFiles.isEncrypted(f))
    assertFalse("second run is a no-op", SecureFiles.migrate(f))
    val out = File(dir, "check.jpg")
    SecureFiles.decrypt(f, out)
    assertArrayEquals(original, out.readBytes())
    // duplicating an encrypted file must not encrypt it twice
    val dup = File(dir, "dup.jpg")
    SecureFiles.encrypt(f, dup)
    assertArrayEquals(f.readBytes(), dup.readBytes())
    assertEquals(0, dir.listFiles()!!.count { it.name.endsWith(".tmp") })
  }

  private fun expectFailure(block: () -> Unit) {
    try {
      block()
      fail("expected a failure")
    } catch (e: Throwable) {
      if (e is AssertionError) throw e
    }
  }

  @Test fun plainLengthIsExactFromTheEncryptedSizeAlone() {
    for (n in listOf(0, 1, 4096, (1 shl 20) - 1, 1 shl 20, (1 shl 20) + 1, 3 * (1 shl 20) + 12345)) {
      val src = File(dir, "len-$n.pdf").apply { writeBytes(bytes(n)) }
      val enc = File(dir, "len-$n.enc")
      SecureFiles.encrypt(src, enc)
      assertEquals("size $n", n.toLong(), SecureFiles.plainLength(enc))
      assertEquals(n.toLong(), SecureFiles.plainLength(src))
    }
  }

  @Test fun printWritesThePlainPdfToTheStreamWithoutAnyFile() {
    val n = 2 * (1 shl 20) + 777
    val src = File(dir, "print.pdf").apply { writeBytes(bytes(n)) }
    val enc = File(dir, "print.enc")
    SecureFiles.encrypt(src, enc)
    val before = dir.listFiles()!!.map { it.name }.toSet()
    val out = java.io.ByteArrayOutputStream()
    PdfPrinter.writePdf(enc, out)
    assertArrayEquals(src.readBytes(), out.toByteArray())
    assertEquals("no decrypted copy left on disk", before, dir.listFiles()!!.map { it.name }.toSet())
    // Unencrypted (pre-migration) files are passed through.
    val plainOut = java.io.ByteArrayOutputStream()
    PdfPrinter.writePdf(src, plainOut)
    assertArrayEquals(src.readBytes(), plainOut.toByteArray())
  }

  @Test fun printRefusesATamperedFile() {
    val src = File(dir, "t.pdf").apply { writeBytes(bytes(5000)) }
    val enc = File(dir, "t.enc")
    SecureFiles.encrypt(src, enc)
    RandomAccessFile(enc, "rw").use { it.seek(60); it.write(it.read() xor 1) }
    try {
      PdfPrinter.writePdf(enc, java.io.ByteArrayOutputStream())
      fail("tampered file must not print")
    } catch (e: Exception) {
      // expected: GCM authentication fails
    }
  }
}
