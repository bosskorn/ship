package app.onescan.vision

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Documents at rest: AES-256-GCM, entirely on device.
 *
 * Key: a random 256-bit data key, wrapped by a non-exportable AES key in the Android
 * Keystore (envelope encryption: the Keystore never leaves its hardware/TEE, and bulk
 * encryption runs in software so 26 MP pages stay fast). The SQLCipher database key is
 * derived from the same data key.
 *
 * File format: "OSE1", then records `[flag u8][plainLength u32][iv 12][ciphertext+tag]`
 * of at most 1 MiB plaintext each. The record index and the last-record flag are
 * authenticated (AAD), so reordered, dropped or truncated data fails to decrypt.
 *
 * Native readers go through [plain]: an encrypted file is decrypted once into the app's
 * cache (`cache/onescan/plain`, cleared on start) and the plaintext copy is used.
 */
internal object SecureFiles {
  private const val SCOPED = "scoped"

  private const val KEK_ALIAS = "onescan.kek.v1"
  private const val CHUNK = 1 shl 20
  private const val PLAIN_CACHE_MAX = 400L * 1024 * 1024
  private const val TAG_BITS = 128
  private const val LAST: Int = 1
  /** Per-record bytes besides the data: flag (1) + length (4) + IV (12) + GCM tag (16). */
  private const val RECORD_OVERHEAD = 1 + 4 + 12 + TAG_BITS / 8
  private val MAGIC = byteArrayOf(0x4f, 0x53, 0x45, 0x31) // "OSE1"
  private val random = SecureRandom()
  private val lock = Any()

  @Volatile private var appContext: Context? = null
  @Volatile private var dek: SecretKey? = null

  class KeyLostException : IllegalStateException("The document key is no longer available on this device")

  fun init(context: Context) {
    appContext = context.applicationContext
  }

  private fun ctx(): Context = appContext ?: throw IllegalStateException("SecureFiles not initialised")

  // ---------------------------------------------------------------- keys

  private fun kek(create: Boolean): SecretKey? {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEK_ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(KEK_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gen.generateKey()
  }

  /** The data key; created (and wrapped) on first use. Never silently replaced. */
  fun dataKey(): SecretKey {
    dek?.let { return it }
    synchronized(lock) {
      dek?.let { return it }
      val dir = File(ctx().filesDir, "onescan-keys").apply { mkdirs() }
      val wrapped = File(dir, "dek.v1")
      val key = if (wrapped.exists()) {
        // A wrapped key without its Keystore key (e.g. data restored onto another device)
        // cannot be recovered: fail loudly instead of making a new key over old documents.
        val k = kek(create = false) ?: throw KeyLostException()
        val b = wrapped.readBytes()
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, k, GCMParameterSpec(TAG_BITS, b, 0, 12))
        SecretKeySpec(c.doFinal(b, 12, b.size - 12), "AES")
      } else {
        val raw = ByteArray(32).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, kek(create = true)!!)
        val tmp = File(dir, "dek.v1.tmp")
        tmp.writeBytes(c.iv + c.doFinal(raw))
        if (!tmp.renameTo(wrapped)) throw IllegalStateException("Could not store the document key")
        SecretKeySpec(raw, "AES")
      }
      dek = key
      return key
    }
  }

  /** Tests only: the Keystore is not available on the JVM. */
  internal fun useKeyForTests(key: SecretKey, context: Context? = null) {
    dek = key
    appContext = context
  }

  /** SQLCipher key (hex), derived from the data key. */
  fun databaseKeyHex(): String {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(dataKey().encoded, "HmacSHA256"))
    return mac.doFinal("onescan-sqlcipher-v1".toByteArray()).joinToString("") { "%02x".format(it) }
  }

  // ---------------------------------------------------------------- files

  fun isEncrypted(file: File): Boolean {
    if (!file.isFile || file.length() < MAGIC.size) return false
    val head = ByteArray(MAGIC.size)
    FileInputStream(file).use { if (it.read(head) != head.size) return false }
    return head.contentEquals(MAGIC)
  }

  private fun aad(index: Int, flag: Int) = byteArrayOf((index ushr 24).toByte(), (index ushr 16).toByte(), (index ushr 8).toByte(), index.toByte(), flag.toByte())

  /** Encrypts `src` into `dst` (temp file + rename: `dst` is never half-written). */
  fun encrypt(src: File, dst: File) {
    val tmp = File(dst.parentFile, "${dst.name}.enc.tmp")
    dst.parentFile?.mkdirs()
    if (isEncrypted(src)) {
      // Already encrypted (e.g. duplicating a document): copy as is.
      src.copyTo(tmp, overwrite = true)
      if (!tmp.renameTo(dst)) { tmp.delete(); throw IllegalStateException("Could not write ${dst.name}") }
      return
    }
    val key = dataKey()
    val total = src.length()
    val count = maxOf(1L, (total + CHUNK - 1) / CHUNK).toInt()
    FileInputStream(src).use { input ->
      DataOutputStream(tmp.outputStream().buffered(1 shl 16)).use { out ->
        out.write(MAGIC)
        val buf = ByteArray(CHUNK)
        for (i in 0 until count) {
          val n = readFully(input, buf)
          val flag = if (i == count - 1) LAST else 0
          val iv = ByteArray(12).also { random.nextBytes(it) }
          val c = Cipher.getInstance("AES/GCM/NoPadding")
          c.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
          c.updateAAD(aad(i, flag))
          val ct = c.doFinal(buf, 0, n)
          out.writeByte(flag)
          out.writeInt(n)
          out.write(iv)
          out.write(ct)
        }
      }
    }
    // rename() replaces an existing target atomically.
    if (!tmp.renameTo(dst)) { tmp.delete(); throw IllegalStateException("Could not write ${dst.name}") }
  }

  /** Decrypts `src` into `dst` (temp file + rename). Throws on any tampering or truncation. */
  fun decrypt(src: File, dst: File) {
    val tmp = File(dst.parentFile, "${dst.name}.dec.tmp")
    dst.parentFile?.mkdirs()
    try {
      DataInputStream(FileInputStream(src).buffered(1 shl 16)).use { input ->
        tmp.outputStream().buffered(1 shl 16).use { out -> decryptStream(input) { b, n -> out.write(b, 0, n) } }
      }
      if (!tmp.renameTo(dst)) throw IllegalStateException("Could not write ${dst.name}")
    } catch (e: Throwable) {
      tmp.delete()
      throw e
    }
  }

  /**
   * Decrypts `src` record by record straight into `out` (e.g. the Android print spooler's
   * stream): no plaintext file is written. Throws on any tampering or truncation; what was
   * already written must then be discarded by the caller.
   */
  fun decryptTo(src: File, out: OutputStream) {
    DataInputStream(FileInputStream(src).buffered(1 shl 16)).use { input -> decryptStream(input) { b, n -> out.write(b, 0, n) } }
  }

  /**
   * Plaintext size of an encrypted file, from its length alone: "OSE1" + per record
   * (flag 1 + length 4 + IV 12 + GCM tag 16 = 33 bytes overhead) + data, records of ≤ CHUNK.
   * Unencrypted files: their length.
   */
  fun plainLength(file: File): Long {
    if (!isEncrypted(file)) return file.length()
    val body = file.length() - MAGIC.size
    val records = maxOf(1L, (body + CHUNK + RECORD_OVERHEAD - 1) / (CHUNK + RECORD_OVERHEAD))
    return maxOf(0L, body - records * RECORD_OVERHEAD)
  }

  private fun decryptStream(input: DataInputStream, sink: (ByteArray, Int) -> Unit) {
    val key = dataKey()
    val head = ByteArray(MAGIC.size)
    input.readFully(head)
    if (!head.contentEquals(MAGIC)) throw IllegalStateException("Not an encrypted document file")
    var i = 0
    while (true) {
      val flag = try { input.readUnsignedByte() } catch (e: EOFException) { throw IllegalStateException("Encrypted file is truncated") }
      val n = input.readInt()
      if (n < 0 || n > CHUNK) throw IllegalStateException("Corrupt encrypted file")
      val iv = ByteArray(12).also { input.readFully(it) }
      val ct = ByteArray(n + TAG_BITS / 8).also { input.readFully(it) }
      val c = Cipher.getInstance("AES/GCM/NoPadding")
      c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
      c.updateAAD(aad(i, flag))
      val pt = c.doFinal(ct)
      sink(pt, pt.size)
      i++
      if (flag == LAST) {
        if (input.read() != -1) throw IllegalStateException("Unexpected data after the last record")
        return
      }
    }
  }

  private fun readFully(input: InputStream, buf: ByteArray): Int {
    var n = 0
    while (n < buf.size) {
      val r = input.read(buf, n, buf.size - n)
      if (r < 0) break
      n += r
    }
    return n
  }

  private fun plainDir(): File = File(ctx().cacheDir, "onescan/plain")

  /** Private, short-lived decrypted copies (OCR). Inside the plain cache: wiped at every launch. */
  private fun scopedDir(): File = File(plainDir(), SCOPED)

  /**
   * Runs [block] on a readable copy of [file] that exists only for this call. An encrypted file
   * is decrypted to a private temp file and deleted in `finally`: on success, on failure, when
   * the JS side gives up (timeout / cancel — this call still runs to its end and cleans up), and
   * on interruption. A file that is not encrypted is passed through and never deleted. If the
   * process is killed mid-call, the copy is in the plain cache, which is cleared on next launch.
   */
  fun <T> withPlainTemp(file: File, dir: File? = null, block: (File) -> T): T {
    if (!isEncrypted(file)) return block(file)
    val d = (dir ?: scopedDir()).apply { mkdirs() }
    val tmp = File(d, "${java.util.UUID.randomUUID()}.${file.extension.ifEmpty { "bin" }}")
    try {
      decrypt(file, tmp)
      return block(tmp)
    } finally {
      tmp.delete()
    }
  }

  /**
   * A readable file for `file`: itself when not encrypted, else a decrypted copy in the
   * cache (reused while the source is unchanged). `name` sets the copy's file name
   * (e.g. the document title for sharing).
   */
  fun plain(file: File, name: String? = null): File {
    if (!isEncrypted(file)) return file
    val id = sha1("${file.absolutePath}|${file.length()}|${file.lastModified()}")
    val ext = file.name.substringAfterLast('.', "")
    val out = if (name != null) File(File(plainDir(), id), name) else File(plainDir(), if (ext.isEmpty()) id else "$id.$ext")
    if (out.exists() && out.length() > 0) return out.also { it.setLastModified(System.currentTimeMillis()) }
    decrypt(file, out)
    trimPlainCache(PLAIN_CACHE_MAX)
    return out
  }

  /** Decrypted copies beyond `max` bytes: oldest-used removed first (they are re-made on demand). */
  private fun trimPlainCache(max: Long) {
    val files = plainDir().walkTopDown().onEnter { it.name != SCOPED }.filter { it.isFile }.toMutableList()
    var total = files.sumOf { it.length() }
    if (total <= max) return
    files.sortBy { it.lastModified() }
    for (f in files) {
      if (total <= max * 3 / 4) break
      val n = f.length()
      if (f.delete()) total -= n
    }
  }

  fun clearPlainCache() {
    plainDir().deleteRecursively()
  }

  /**
   * Plaintext → encrypted in place, kill-safe: encrypt to a temp file, verify it decrypts
   * to the same bytes (SHA-256), then atomically replace. Returns false when the file was
   * already encrypted (so a migration can simply be re-run after an interruption).
   */
  fun migrate(file: File): Boolean {
    if (!file.isFile || isEncrypted(file)) return false
    val enc = File(file.parentFile, "${file.name}.mig.tmp")
    encrypt(file, enc)
    val want = sha256(file)
    val md = MessageDigest.getInstance("SHA-256")
    DataInputStream(FileInputStream(enc).buffered(1 shl 16)).use { input -> decryptStream(input) { b, n -> md.update(b, 0, n) } }
    if (!md.digest().contentEquals(want)) {
      enc.delete()
      throw IllegalStateException("Encryption check failed for ${file.name}")
    }
    // rename() replaces the target atomically on Android's file systems.
    if (!enc.renameTo(file)) {
      enc.delete()
      throw IllegalStateException("Could not replace ${file.name}")
    }
    return true
  }

  private fun sha256(f: File): ByteArray {
    val md = MessageDigest.getInstance("SHA-256")
    FileInputStream(f).use { input ->
      val buf = ByteArray(1 shl 16)
      while (true) {
        val r = input.read(buf)
        if (r < 0) break
        md.update(buf, 0, r)
      }
    }
    return md.digest()
  }

  private fun sha1(s: String) = MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
