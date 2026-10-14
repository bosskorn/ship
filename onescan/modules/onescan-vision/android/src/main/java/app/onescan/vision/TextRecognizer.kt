package app.onescan.vision

import android.content.Context
import android.graphics.Bitmap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.googlecode.tesseract.android.TessBaseAPI
import java.io.File

/**
 * On-device OCR only (spec §16). ML Kit has no Thai model, so Thai pages use
 * Tesseract with bundled `tha`+`eng` models; Latin-only requests use ML Kit.
 */
internal object TextRecognizer {
  private const val OCR_EDGE = 2480
  private val tessLock = Any()

  fun recognize(context: Context, file: File, languages: List<String>): List<Map<String, Any>> {
    val bmp = ImageIO.loadUpright(file, OCR_EDGE)
    try {
      return if (languages.any { it.startsWith("th") }) tesseract(context, bmp, "tha+eng") else mlKit(bmp)
    } finally {
      bmp.recycle()
    }
  }

  private fun block(text: String, l: Int, t: Int, r: Int, b: Int, w: Int, h: Int, confidence: Double): Map<String, Any> =
    mapOf(
      "text" to text,
      "box" to mapOf(
        "x" to l.toDouble() / w,
        "y" to t.toDouble() / h,
        "width" to (r - l).toDouble() / w,
        "height" to (b - t).toDouble() / h,
      ),
      "confidence" to confidence,
    )

  private fun mlKit(bmp: Bitmap): List<Map<String, Any>> {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bmp, 0)))
      val out = ArrayList<Map<String, Any>>()
      for (b in result.textBlocks) for (line in b.lines) {
        val r = line.boundingBox ?: continue
        out.add(block(line.text, r.left, r.top, r.right, r.bottom, bmp.width, bmp.height, 1.0))
      }
      return out
    } finally {
      recognizer.close()
    }
  }

  @Volatile private var tessReady: File? = null

  /**
   * Copies bundled models from assets once; Tesseract needs real files. Each model is written
   * to a temp file and renamed into place, and an existing file must match the asset's size,
   * so a copy cut short by a kill (which used to break OCR — and with it every save — for
   * good) is redone on the next run.
   */
  private fun tessDataRoot(context: Context): File {
    tessReady?.let { return it }
    val root = File(context.filesDir, "tesseract")
    val dir = File(root, "tessdata").apply { mkdirs() }
    for (name in listOf("tha.traineddata", "eng.traineddata")) {
      val target = File(dir, name)
      val size = assetSize(context, "tessdata/$name")
      if (target.exists() && target.length() == size) continue
      val tmp = File(dir, "$name.tmp")
      context.assets.open("tessdata/$name").use { input -> tmp.outputStream().use { input.copyTo(it) } }
      if (tmp.length() != size || !tmp.renameTo(target)) {
        tmp.delete()
        throw IllegalStateException("Could not install OCR model $name")
      }
    }
    tessReady = root
    return root
  }

  private fun assetSize(context: Context, path: String): Long {
    var n = 0L
    val buf = ByteArray(1 shl 16)
    context.assets.open(path).use { input ->
      while (true) {
        val r = input.read(buf)
        if (r < 0) break
        n += r
      }
    }
    return n
  }

  private fun tesseract(context: Context, bmp: Bitmap, lang: String): List<Map<String, Any>> = synchronized(tessLock) {
    val api = TessBaseAPI()
    try {
      if (!api.init(tessDataRoot(context).absolutePath, lang)) throw IllegalStateException("Tesseract init failed")
      api.pageSegMode = TessBaseAPI.PageSegMode.PSM_AUTO
      api.setImage(bmp)
      api.getUTF8Text() // runs recognition
      val out = ArrayList<Map<String, Any>>()
      val it = api.resultIterator ?: return out
      try {
        val level = TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE
        it.begin()
        do {
          val text = it.getUTF8Text(level)?.trim().orEmpty()
          if (text.isEmpty()) continue
          val r = it.getBoundingRect(level)
          out.add(block(text, r.left, r.top, r.right, r.bottom, bmp.width, bmp.height, it.confidence(level) / 100.0))
        } while (it.next(level))
      } finally {
        it.delete()
      }
      out
    } finally {
      api.recycle()
    }
  }
}
