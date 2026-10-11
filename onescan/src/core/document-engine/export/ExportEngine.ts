import * as Sharing from 'expo-sharing';

/** User-initiated sharing via the OS share sheet only. */
export const ExportEngine = {
  isShareAvailable: () => Sharing.isAvailableAsync(),

  async sharePdf(uri: string, title: string) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  },
};
