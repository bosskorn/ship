package app.onescan.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PdfWriterTest {
  private val rgb = File("src/test/resources/page_rgb.jpg")
  private val gray = File("src/test/resources/page_gray.jpg")

  @Test
  fun readsJpegHeader() {
    assertEquals(PdfWriter.JpegInfo(64, 48, 3), PdfWriter.jpegInfo(rgb))
    assertEquals(PdfWriter.JpegInfo(48, 64, 1), PdfWriter.jpegInfo(gray))
  }

  @Test
  fun embedsJpegBytesUnchangedWithValidXref() {
    val out = File.createTempFile("onescan", ".pdf")
    PdfWriter.write(out, listOf(rgb, gray))
    val pdf = out.readBytes()
    val text = String(pdf, Charsets.ISO_8859_1)
    assertTrue(text.startsWith("%PDF-1.4"))
    assertTrue(text.trimEnd().endsWith("%%EOF"))
    assertEquals(2, Regex("/Filter /DCTDecode").findAll(text).count())
    assertTrue("landscape page for the 64×48 image", text.contains("/MediaBox [0 0 841.89 595.28]"))
    assertTrue("portrait page for the 48×64 image", text.contains("/MediaBox [0 0 595.28 841.89]"))
    assertTrue(text.contains("/ColorSpace /DeviceGray"))
    // The master JPEG is embedded byte for byte (no re-encoding).
    for (f in listOf(rgb, gray)) assertTrue("${f.name} embedded unchanged", String(f.readBytes(), Charsets.ISO_8859_1) in text)
    // Every xref entry points at its object.
    val xrefAt = text.substringAfterLast("startxref\n").trim().lines().first().toInt()
    val entries = text.substring(xrefAt).lines().drop(3).takeWhile { it.endsWith(" n ") || it.endsWith(" n") }
    assertEquals(8, entries.size)
    entries.forEachIndexed { i, e ->
      val off = e.substring(0, 10).toInt()
      assertTrue("object ${i + 1} at $off", text.startsWith("${i + 1} 0 obj", off))
    }
    out.delete()
  }
}
