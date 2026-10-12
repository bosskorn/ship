package app.onescan.vision

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import java.io.File

/**
 * System document scanner (Google ML Kit Document Scanner, via Google Play services).
 * Edge detection, auto capture, perspective correction and finger/stain cleanup all run
 * on the device; images are returned to the app and never uploaded. Pages are copied
 * into the app cache and returned as file URIs.
 */
object DocumentScanner {
  const val REQUEST_CODE = 0x05CA
  private var pending: Promise? = null

  fun start(activity: Activity, pageLimit: Int, allowGallery: Boolean, promise: Promise) {
    if (pending != null) {
      promise.reject("E_SCANNER_BUSY", "A scan is already in progress", null)
      return
    }
    val options = GmsDocumentScannerOptions.Builder()
      .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
      .setGalleryImportAllowed(allowGallery)
      .setPageLimit(pageLimit.coerceIn(1, 100))
      .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
      .build()
    GmsDocumentScanning.getClient(options)
      .getStartScanIntent(activity)
      .addOnSuccessListener { sender ->
        pending = promise
        try {
          activity.startIntentSenderForResult(sender, REQUEST_CODE, null, 0, 0, 0)
        } catch (e: Exception) {
          pending = null
          promise.reject("E_SCANNER_UNAVAILABLE", e.message ?: "Scanner unavailable", e)
        }
      }
      .addOnFailureListener { e -> promise.reject("E_SCANNER_UNAVAILABLE", e.message ?: "Scanner unavailable", e) }
  }

  fun onResult(context: Context, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE) return
    val promise = pending ?: return
    pending = null
    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(mapOf("pages" to emptyList<Any>()))
      return
    }
    try {
      val result = GmsDocumentScanningResult.fromActivityResultIntent(data)
      val pages = result?.pages.orEmpty().map { page -> copy(context, page.imageUri) }
      promise.resolve(mapOf("pages" to pages))
    } catch (e: Exception) {
      promise.reject("E_SCANNER_FAILED", e.message ?: "Scan failed", e)
    }
  }

  private fun copy(context: Context, uri: Uri): Map<String, Any> {
    val out = File(ImageIO.outputDir(context), "scan_${System.nanoTime()}.jpg")
    context.contentResolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "Cannot read scanned page" }
      out.outputStream().use { input.copyTo(it) }
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(out.path, bounds)
    return mapOf("uri" to ImageIO.uriOf(out), "width" to bounds.outWidth, "height" to bounds.outHeight)
  }
}
