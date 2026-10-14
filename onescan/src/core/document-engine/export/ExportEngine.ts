import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { DocumentFileStore } from '../storage/DocumentFileStore';

const pdfName = (title: string) => `${title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'OneScan'}.pdf`;

/** User-initiated sharing and printing via the OS share sheet / Android Print Framework only. */
export const ExportEngine = {
  isShareAvailable: () => Sharing.isAvailableAsync(),

  async sharePdf(uri: string, title: string) {
    // Stored PDFs are encrypted at rest: share a decrypted copy from the app cache (cleared on start).
    const readable = await DocumentFileStore.readableUri(uri, pdfName(title));
    await Sharing.shareAsync(readable, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  },

  /** Opens the system print dialog for the document's PDF (decrypted cache copy, on device). */
  async printPdf(uri: string, title: string) {
    const readable = await DocumentFileStore.readableUri(uri, pdfName(title));
    await Print.printAsync({ uri: readable });
  },
};
