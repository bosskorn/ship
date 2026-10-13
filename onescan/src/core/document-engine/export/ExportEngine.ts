import * as Sharing from 'expo-sharing';
import { DocumentFileStore } from '../storage/DocumentFileStore';

/** User-initiated sharing via the OS share sheet only. */
export const ExportEngine = {
  isShareAvailable: () => Sharing.isAvailableAsync(),

  async sharePdf(uri: string, title: string) {
    // Stored PDFs are encrypted at rest: share a decrypted copy from the app cache (cleared on start).
    const name = `${title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'OneScan'}.pdf`;
    const readable = await DocumentFileStore.readableUri(uri, name);
    await Sharing.shareAsync(readable, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  },
};
