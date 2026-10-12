package app.onescan.vision

import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.Locale

/**
 * Minimal PDF writer that embeds each page's JPEG bytes unchanged (DCTDecode): the PDF
 * holds exactly the master image — no decode, no resampling, no re-compression — and
 * pages are streamed from disk one at a time. Each page is A4 (portrait or landscape to
 * match the image) with the image fitted and centred. Pure JVM; mirrored in
 * `ios/PdfWriter.swift`.
 */
object PdfWriter {
  /** A4 in PDF points. */
  private const val A4_W = 595.28
  private const val A4_H = 841.89

  data class JpegInfo(val width: Int, val height: Int, val components: Int)

  /** Reads size and colour components from the JPEG's SOF marker. */
  fun jpegInfo(file: File): JpegInfo {
    FileInputStream(file).buffered().use { s ->
      fun u8(): Int = s.read().also { if (it < 0) throw IllegalArgumentException("Truncated JPEG: ${file.name}") }
      fun u16(): Int = (u8() shl 8) or u8()
      require(u8() == 0xFF && u8() == 0xD8) { "Not a JPEG: ${file.name}" }
      while (true) {
        var m = u8()
        while (m != 0xFF) m = u8()
        var marker = u8()
        while (marker == 0xFF) marker = u8()
        if (marker == 0xD8 || marker in 0xD0..0xD7 || marker == 0x01) continue
        require(marker != 0xD9 && marker != 0xDA) { "No frame header in ${file.name}" }
        val len = u16()
        val isSof = marker in 0xC0..0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC
        if (isSof) {
          u8() // precision
          val h = u16()
          val w = u16()
          val comps = u8()
          require(w > 0 && h > 0) { "Bad JPEG size in ${file.name}" }
          return JpegInfo(w, h, comps)
        }
        var skip = len - 2L
        while (skip > 0) {
          val n = s.skip(skip)
          if (n <= 0) {
            u8()
            skip--
          } else {
            skip -= n
          }
        }
      }
    }
  }

  fun write(out: File, pages: List<File>) {
    require(pages.isNotEmpty()) { "No pages" }
    val infos = pages.map { jpegInfo(it) }
    val offsets = mutableListOf<Long>()
    CountingStream(BufferedOutputStream(FileOutputStream(out), 1 shl 16)).use { o ->
      o.ascii("%PDF-1.4\n")
      o.write(byteArrayOf('%'.code.toByte(), 0xE2.toByte(), 0xE3.toByte(), 0xCF.toByte(), 0xD3.toByte(), '\n'.code.toByte()))
      fun obj(n: Int, body: () -> Unit) {
        while (offsets.size < n) offsets.add(0)
        offsets[n - 1] = o.count
        o.ascii("$n 0 obj\n")
        body()
        o.ascii("\nendobj\n")
      }
      val pageObj = { i: Int -> 3 + i * 3 }
      obj(1) { o.ascii("<< /Type /Catalog /Pages 2 0 R >>") }
      obj(2) {
        o.ascii("<< /Type /Pages /Count ${pages.size} /Kids [${pages.indices.joinToString(" ") { "${pageObj(it)} 0 R" }}] >>")
      }
      pages.forEachIndexed { i, file ->
        val info = infos[i]
        val landscape = info.width > info.height
        val pw = if (landscape) A4_H else A4_W
        val ph = if (landscape) A4_W else A4_H
        val scale = minOf(pw / info.width, ph / info.height)
        val dw = info.width * scale
        val dh = info.height * scale
        val dx = (pw - dw) / 2
        val dy = (ph - dh) / 2
        val n = pageObj(i)
        obj(n) {
          o.ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] ")
          o.ascii("/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>")
        }
        val content = "q ${f(dw)} 0 0 ${f(dh)} ${f(dx)} ${f(dy)} cm /Im0 Do Q".toByteArray(Charsets.US_ASCII)
        obj(n + 1) {
          o.ascii("<< /Length ${content.size} >>\nstream\n")
          o.write(content)
          o.ascii("\nendstream")
        }
        val colorSpace = when (info.components) {
          1 -> "/DeviceGray"
          4 -> "/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]"
          else -> "/DeviceRGB"
        }
        obj(n + 2) {
          o.ascii(
            "<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} " +
              "/ColorSpace $colorSpace /BitsPerComponent 8 /Filter /DCTDecode /Length ${file.length()} >>\nstream\n",
          )
          FileInputStream(file).use { it.copyTo(o, 1 shl 16) }
          o.ascii("\nendstream")
        }
      }
      val xref = o.count
      o.ascii("xref\n0 ${offsets.size + 1}\n0000000000 65535 f \n")
      for (off in offsets) o.ascii(String.format(Locale.US, "%010d 00000 n \n", off))
      o.ascii("trailer\n<< /Size ${offsets.size + 1} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
    }
  }

  private fun f(v: Double) = String.format(Locale.US, "%.2f", v)

  private class CountingStream(private val inner: OutputStream) : OutputStream() {
    var count = 0L
      private set

    override fun write(b: Int) {
      inner.write(b)
      count++
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
      inner.write(b, off, len)
      count += len
    }

    fun ascii(s: String) = write(s.toByteArray(Charsets.US_ASCII))

    override fun flush() = inner.flush()

    override fun close() = inner.close()
  }
}
