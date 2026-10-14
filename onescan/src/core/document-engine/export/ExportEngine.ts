import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { DocumentFileStore } from '../storage/DocumentFileStore';
import { OneScanVision } from '@/native/OneScanVision';

const pdfName = (title: string) => `${title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'OneScan'}.pdf`;

/** User-initiated sharing and printing via the OS share sheet / Android Print Framework only. */
export const ExportEngine = {
  isShareAvailable: () => Sharing.isAvailableAsync(),

  async sharePdf(uri: string, title: string) {
    // Stored PDFs are encrypted at rest: share a decrypted copy from the app cache (cleared on start).
    const readable = await DocumentFileStore.readableUri(uri, pdfName(title));
    await Sharing.shareAsync(readable, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  },

  /** Printing needs the native print adapter (Android); otherwise the action is not offered. */
  canPrint: () => Platform.OS === 'android' && !!OneScanVision?.printPdfAsync,

  /**
   * Opens the Android print dialog. The stored (encrypted) PDF is decrypted straight into the
   * print spooler each time Android asks for it — no decrypted file is written, so nothing is
   * left behind after printing.
   */
  async printPdf(uri: string, title: string) {
    if (!OneScanVision?.printPdfAsync) throw new Error('print_unavailable');
    await OneScanVision.printPdfAsync(uri, pdfName(title).replace(/\.pdf$/, ''));
  },
};
