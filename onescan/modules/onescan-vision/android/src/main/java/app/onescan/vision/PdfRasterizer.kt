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
  fun render(context: Context, file: File, maxWidth: Int): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      val renderer = PdfRenderer(pfd)
      try {
        for (i in 0 until renderer.pageCount) {
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
