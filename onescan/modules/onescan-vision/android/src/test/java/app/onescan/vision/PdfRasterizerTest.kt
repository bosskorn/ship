package app.onescan.vision

import org.junit.Assert.assertEquals
import org.junit.Test

class PdfRasterizerTest {
  @Test
  fun pageWindowClampsToTheDocument() {
    assertEquals(0 until 10, PdfRasterizer.pageWindow(10, 0, Int.MAX_VALUE))
    assertEquals(3 until 4, PdfRasterizer.pageWindow(10, 3, 1))
    assertEquals(8 until 10, PdfRasterizer.pageWindow(10, 8, 5))
    assertEquals(10 until 10, PdfRasterizer.pageWindow(10, 12, 1))
    assertEquals(0 until 0, PdfRasterizer.pageWindow(10, -1, 0))
    assertEquals(0 until 2, PdfRasterizer.pageWindow(10, -4, 2))
  }
}
