package app.onescan.vision

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * DocSeg — on-device document segmentation. Port of the reference runtime in
 * `src/core/document-engine/capture/docSeg.ts` (keep the two in sync; the JVM test
 * checks parity against the exporter's vector). Y/Cb/Cr planes → 64×64 page
 * probabilities (0..255). Pure Kotlin, no ML runtime dependency.
 */
class DocSeg(private val weights: Weights) {
  /** Blocks per stage (encoder e1..e4, decoder d3..d1) and arrays in forward order. */
  class Weights(val blocks: IntArray, val arrays: Array<FloatArray>)

  private val w = weights.arrays
  private class T(val c: Int, val h: Int, val w: Int, val d: FloatArray)

  private var i = 0
  private fun next(): FloatArray = w[i++]

  /** 64×64 probabilities scaled to 0..255 (row-major). */
  fun mask(y: ByteArray, cb: ByteArray?, cr: ByteArray?, width: Int, height: Int): ByteArray {
    val logits = logits(input(y, cb, cr, width, height))
    val out = ByteArray(logits.size)
    for (k in logits.indices) out[k] = (255.0 / (1.0 + exp(-logits[k].toDouble()))).roundToInt().toByte()
    return out
  }

  fun input(y: ByteArray, cb: ByteArray?, cr: ByteArray?, width: Int, height: Int): FloatArray {
    val s = INPUT
    val out = FloatArray(3 * s * s)
    resize(y, width, height, out, 0)
    if (cb != null && cr != null) {
      resize(cb, width, height, out, s * s)
      resize(cr, width, height, out, 2 * s * s)
    }
    return out
  }

  @Synchronized
  fun logits(input: FloatArray): FloatArray {
    i = 0
    // Channel widths come from the weight file (bias length = output channels).
    val stemW = next()
    val stemB = next()
    val b = weights.blocks
    var x = conv3x3(T(3, INPUT, INPUT, input), stemW, stemB, stemB.size, 2)
    val s1 = stage(x, b[0], 1)
    val s2 = stage(s1, b[1], 2)
    val s3 = stage(s2, b[2], 2)
    val s4 = stage(s3, b[3], 2)
    val cw = next()
    val cbias = next()
    val n4 = s4.h * s4.w
    val c4 = s4.c
    val mean = FloatArray(c4)
    for (c in 0 until c4) {
      var a = 0f
      for (p in 0 until n4) a += s4.d[c * n4 + p]
      mean[c] = a / n4
    }
    for (c in 0 until c4) {
      var v = cbias[c]
      for (k in 0 until c4) v += cw[c * c4 + k] * mean[k]
      for (p in 0 until n4) {
        val t = s4.d[c * n4 + p] + v
        s4.d[c * n4 + p] = if (t > 0f) t else 0f
      }
    }
    var d = dec(s4, s3, b[4])
    d = dec(d, s2, b[5])
    d = dec(d, s1, b[6])
    val headW = next()
    val headB = next()
    x = pointwise(d, headW, headB, 1, false)
    return x.d
  }

  private fun sep(x: T, stride: Int): T {
    val dwW = next()
    val dwB = next()
    val pwW = next()
    val pwB = next()
    return pointwise(depthwise(x, dwW, dwB, stride), pwW, pwB, pwB.size, true)
  }

  private fun stage(x: T, n: Int, stride: Int): T {
    var y = sep(x, stride)
    for (k in 1 until n) y = sep(y, 1)
    return y
  }

  private fun dec(a: T, skip: T, n: Int): T {
    val pw = next()
    val pb = next()
    var y = pointwise(upCat(a, skip), pw, pb, pb.size, true)
    for (k in 0 until n) y = sep(y, 1)
    return y
  }

  private fun conv3x3(x: T, wt: FloatArray, b: FloatArray, cout: Int, stride: Int): T {
    val ho = (x.h - 1) / stride + 1
    val wo = (x.w - 1) / stride + 1
    val out = FloatArray(cout * ho * wo)
    for (co in 0 until cout) for (oy in 0 until ho) for (ox in 0 until wo) {
      var s = b[co]
      for (ci in 0 until x.c) {
        val base = ci * x.h * x.w
        val wb = (co * x.c + ci) * 9
        for (ky in 0 until 3) {
          val iy = oy * stride + ky - 1
          if (iy < 0 || iy >= x.h) continue
          for (kx in 0 until 3) {
            val ix = ox * stride + kx - 1
            if (ix < 0 || ix >= x.w) continue
            s += wt[wb + ky * 3 + kx] * x.d[base + iy * x.w + ix]
          }
        }
      }
      out[(co * ho + oy) * wo + ox] = if (s > 0f) s else 0f
    }
    return T(cout, ho, wo, out)
  }

  private fun depthwise(x: T, wt: FloatArray, b: FloatArray, stride: Int): T {
    val ho = (x.h - 1) / stride + 1
    val wo = (x.w - 1) / stride + 1
    val out = FloatArray(x.c * ho * wo)
    for (c in 0 until x.c) {
      val base = c * x.h * x.w
      val w0 = c * 9
      for (oy in 0 until ho) for (ox in 0 until wo) {
        var s = b[c]
        for (ky in 0 until 3) {
          val iy = oy * stride + ky - 1
          if (iy < 0 || iy >= x.h) continue
          for (kx in 0 until 3) {
            val ix = ox * stride + kx - 1
            if (ix < 0 || ix >= x.w) continue
            s += wt[w0 + ky * 3 + kx] * x.d[base + iy * x.w + ix]
          }
        }
        out[(c * ho + oy) * wo + ox] = if (s > 0f) s else 0f
      }
    }
    return T(x.c, ho, wo, out)
  }

  private fun pointwise(x: T, wt: FloatArray, b: FloatArray, cout: Int, relu: Boolean): T {
    val n = x.h * x.w
    val out = FloatArray(cout * n)
    for (co in 0 until cout) {
      val o = co * n
      java.util.Arrays.fill(out, o, o + n, b[co])
      for (ci in 0 until x.c) {
        val k = wt[co * x.c + ci]
        if (k == 0f) continue
        val src = ci * n
        for (p in 0 until n) out[o + p] += k * x.d[src + p]
      }
      if (relu) for (p in o until o + n) if (out[p] < 0f) out[p] = 0f
    }
    return T(cout, x.h, x.w, out)
  }

  private fun upCat(a: T, s: T): T {
    val h = a.h * 2
    val w = a.w * 2
    val out = FloatArray((a.c + s.c) * h * w)
    for (c in 0 until a.c) for (y in 0 until h) for (x in 0 until w) {
      out[(c * h + y) * w + x] = a.d[(c * a.h + (y shr 1)) * a.w + (x shr 1)]
    }
    System.arraycopy(s.d, 0, out, a.c * h * w, s.d.size)
    return T(a.c + s.c, h, w, out)
  }

  companion object {
    const val INPUT = 128
    const val MASK = 64

    @Volatile private var shared: DocSeg? = null

    /** Lazily loads `assets/docseg.bin`; null if the model is missing or corrupt. */
    fun get(context: Context): DocSeg? {
      shared?.let { return it }
      return synchronized(this) {
        shared ?: try {
          context.assets.open("docseg.bin").use { DocSeg(parse(it.readBytes())) }.also { shared = it }
        } catch (_: Exception) {
          null
        }
      }
    }

    fun parse(bytes: ByteArray): Weights {
      require(bytes.size >= 36 && String(bytes, 0, 4, Charsets.US_ASCII) == "DSG2") { "docseg: bad weight file" }
      val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      buf.position(4)
      val blocks = IntArray(7) { buf.int }
      val count = buf.int
      // stem + 2 convs per block + decoder 1×1s, each weight + bias, + context + head.
      val convs = 1 + 2 * blocks.sum() + 3
      require(blocks.withIndex().all { (k, v) -> v >= (if (k < 4) 1 else 0) && v <= 16 } && count == convs * 2 + 4) {
        "docseg: unexpected layer count"
      }
      val arrays = Array(count) {
        require(buf.remaining() >= 4) { "docseg: truncated weight file" }
        val n = buf.int
        require(n >= 0 && buf.remaining() >= n * 4) { "docseg: truncated weight file" }
        FloatArray(n) { buf.float }
      }
      return Weights(blocks, arrays)
    }

    /** Bilinear (align_corners=false) resize of one plane to INPUT², scaled to [-1,1]. */
    fun resize(src: ByteArray, w: Int, h: Int, out: FloatArray, off: Int) {
      val s = INPUT
      val sx = w.toDouble() / s
      val sy = h.toDouble() / s
      for (y in 0 until s) {
        val fy = min((h - 1).toDouble(), max(0.0, (y + 0.5) * sy - 0.5))
        val y0 = floor(fy).toInt()
        val y1 = min(h - 1, y0 + 1)
        val ty = fy - y0
        for (x in 0 until s) {
          val fx = min((w - 1).toDouble(), max(0.0, (x + 0.5) * sx - 0.5))
          val x0 = floor(fx).toInt()
          val x1 = min(w - 1, x0 + 1)
          val tx = fx - x0
          val p00 = src[y0 * w + x0].toInt() and 0xff
          val p01 = src[y0 * w + x1].toInt() and 0xff
          val p10 = src[y1 * w + x0].toInt() and 0xff
          val p11 = src[y1 * w + x1].toInt() and 0xff
          val top = p00 * (1 - tx) + p01 * tx
          val bot = p10 * (1 - tx) + p11 * tx
          out[off + y * s + x] = (Math.round(top * (1 - ty) + bot * ty).toInt() - 128) / 128f
        }
      }
    }
  }
}
