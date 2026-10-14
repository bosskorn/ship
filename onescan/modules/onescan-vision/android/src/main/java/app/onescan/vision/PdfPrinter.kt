package app.onescan.vision

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.concurrent.Executors

/**
 * Prints a stored document PDF through the Android Print Framework without ever writing a
 * decrypted copy to disk: every time the framework asks for the document (preview, settings
 * change, final job) the encrypted file is decrypted record by record straight into the
 * spooler's file descriptor. Unencrypted files (pre-migration) are copied as they are.
 */
internal object PdfPrinter {
  private val io = Executors.newSingleThreadExecutor()

  /** Must be called on the main thread with the current activity. */
  fun print(activity: Activity, file: File, jobName: String) {
    if (!file.isFile) throw IllegalArgumentException("Document file not found")
    val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
    manager.print(jobName, Adapter(file, jobName), PrintAttributes.Builder().build())
  }

  /** Writes the document's PDF bytes to `out` (decrypting when needed). */
  fun writePdf(file: File, out: OutputStream) {
    if (SecureFiles.isEncrypted(file)) SecureFiles.decryptTo(file, out)
    else file.inputStream().use { it.copyTo(out, 1 shl 16) }
    out.flush()
  }

  private class Adapter(private val file: File, private val jobName: String) : PrintDocumentAdapter() {
    override fun onLayout(
      oldAttributes: PrintAttributes?, newAttributes: PrintAttributes, cancellationSignal: CancellationSignal,
      callback: LayoutResultCallback, extras: Bundle?,
    ) {
      if (cancellationSignal.isCanceled) return callback.onLayoutCancelled()
      val info = PrintDocumentInfo.Builder(jobName).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build()
      callback.onLayoutFinished(info, oldAttributes != newAttributes)
    }

    override fun onWrite(pages: Array<out PageRange>, destination: ParcelFileDescriptor, cancellationSignal: CancellationSignal, callback: WriteResultCallback) {
      io.execute {
        try {
          // The spooler owns `destination`; we only write to it.
          FileOutputStream(destination.fileDescriptor).use { out -> writePdf(file, out) }
          if (cancellationSignal.isCanceled) callback.onWriteCancelled()
          else callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
        } catch (e: Throwable) {
          // No path or document details in the message.
          callback.onWriteFailed("OneScan could not read this document")
        }
      }
    }
  }
}
