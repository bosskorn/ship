package app.onescan.vision

import org.junit.Test
import java.io.File

/**
 * Scan-quality harness for tools/scanquality: runs the real filters / PDF writer on
 * files listed in `qa/jobs.txt` (module dir, git-ignored). No-op when that file is absent.
 *
 *   filter <scan|card> <in.rgb> <out.raw>   — .rgb = int32 LE width, height + RGB bytes
 *   pdf <out.pdf> <page1.jpg> <page2.jpg> …
 * Timings are appended to `qa/timings.txt`.
 */
class QaHarnessTest {
  @Test
  fun runJobs() {
    val jobs = File("qa/jobs.txt")
    if (!jobs.exists()) return
    val timings = StringBuilder()
    for (line in jobs.readLines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }) {
      val p = line.split(Regex("\\s+"))
      val t0 = System.nanoTime()
      when (p[0]) {
        "filter" -> {
          val b = File(p[2]).readBytes()
          fun i32(o: Int) = (b[o].toInt() and 0xff) or ((b[o + 1].toInt() and 0xff) shl 8) or ((b[o + 2].toInt() and 0xff) shl 16) or ((b[o + 3].toInt() and 0xff) shl 24)
          val w = i32(0)
          val h = i32(4)
          val px = IntArray(w * h) { k -> (0xff shl 24) or ((b[8 + 3 * k].toInt() and 0xff) shl 16) or ((b[9 + 3 * k].toInt() and 0xff) shl 8) or (b[10 + 3 * k].toInt() and 0xff) }
          val tf = System.nanoTime()
          when (p[1]) {
            "scan" -> PageProcessor.scanLook(px, w, h)
            "card" -> CardLook.apply(px, w, h)
            else -> error("unknown filter ${p[1]}")
          }
          val ms = (System.nanoTime() - tf) / 1_000_000
          val out = ByteArray(w * h * 3)
          for (k in px.indices) {
            out[3 * k] = (px[k] shr 16).toByte()
            out[3 * k + 1] = (px[k] shr 8).toByte()
            out[3 * k + 2] = px[k].toByte()
          }
          File(p[3]).writeBytes(out)
          timings.append("filter ${p[1]} ${w}x$h ${ms}ms ${p[2]}\n")
        }
        "pdf" -> {
          PdfWriter.write(File(p[1]), p.drop(2).map { File(it) })
          timings.append("pdf ${p.size - 2} pages ${(System.nanoTime() - t0) / 1_000_000}ms ${File(p[1]).length()} bytes\n")
        }
        else -> error("unknown job ${p[0]}")
      }
    }
    File("qa/timings.txt").writeText(timings.toString())
  }
}
