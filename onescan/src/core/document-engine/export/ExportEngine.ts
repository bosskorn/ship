import * as Sharing from 'expo-sharing';
import { DocumentFileStore } from '../storage/DocumentFileStore';
import { shareCopyUri, sweepShareCopies } from './shareTemp';

/** User-initiated sharing via the OS share sheet only. */
export const ExportEngine = {
  isShareAvailable: () => Sharing.isAvailableAsync(),

  async sharePdf(uri: string, title: string) {
    // Stored PDFs are encrypted at rest: share a decrypted copy made for this share only. It is
    // not deleted when the sheet closes (the receiving app may still be reading it); old share
    // copies are swept here, on resume and at start (shareTemp.ts).
    const name = `${title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'OneScan'}.pdf`;
    await sweepShareCopies();
    const readable = (await shareCopyUri(uri, name)) ?? (await DocumentFileStore.readableUri(uri, name));
    try {
      await Sharing.shareAsync(readable, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    } finally {
      await sweepShareCopies();
    }
  },
};
