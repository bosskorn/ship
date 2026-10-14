package app.onescan.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import kotlin.math.roundToInt

/** Renders an imported PDF to page images, one page in memory at a time (spec §53). */
internal object PdfRasterizer {
  fun render(context: Context, file: File, maxWidth: Int): List<Map<String, Any>> = render(context, file, maxWidth, 0, Int.MAX_VALUE)

  /** Pages [from, from + count) clamped to the document (no overflow for count = Int.MAX_VALUE). */
  fun pageWindow(pageCount: Int, from: Int, count: Int): IntRange {
    val first = from.coerceIn(0, pageCount)
    val end = if (count >= pageCount - first) pageCount else first + count.coerceAtLeast(0)
    return first until end
  }

  /** Page count without rendering anything. */
  fun pageCount(file: File): Int {
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      val renderer = PdfRenderer(pfd)
      try {
        return renderer.pageCount
      } finally {
        renderer.close()
      }
    } finally {
      pfd.close()
    }
  }

  /**
   * Pages [from, from + count) only, so callers can work page by page (progress, cancel, and
   * no up-front render of a long PDF). Out-of-range pages are skipped.
   */
  fun render(context: Context, file: File, maxWidth: Int, from: Int, count: Int): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      val renderer = PdfRenderer(pfd)
      try {
        for (i in pageWindow(renderer.pageCount, from, count)) {
          val page = renderer.openPage(i)
          try {
            val scale = maxWidth.toFloat() / page.width
            val w = maxWidth
            val h = (page.height * scale).roundToInt().coerceAtLeast(1)
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val saved = ImageIO.saveJpeg(context, bmp, "pdfpage", 95)
            out.add(mapOf("uri" to ImageIO.uriOf(saved), "width" to w, "height" to h))
            bmp.recycle()
          } finally {
            page.close()
          }
        }
      } finally {
        renderer.close()
      }
    } finally {
      pfd.close()
    }
    return out
  }
}
