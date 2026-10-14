import * as Print from 'expo-print';
import { OneScanVision } from '@/native/OneScanVision';
import { DocumentFileStore } from '../storage/DocumentFileStore';
import { A4, buildPdfHtml, PdfPageInput } from './pdfHtml';
import type { PageFilter, Rotation } from '../model';

export interface PdfSourcePage {
  uri: string;
  width: number;
  height: number;
  filter: PageFilter;
  rotation: Rotation;
  filterApplied: boolean;
}

/**
 * Local PDF generation (offline, no upload). With the native module, each page's
 * master JPEG is embedded byte-for-byte (no decode, resample or re-compression; pages
 * streamed from disk). Without it (Expo Go / web) the platform print engine is used,
 * which may resample images.
 */
export const PDFEngine = {
  async create(pages: PdfSourcePage[], title: string): Promise<{ uri: string; pageCount: number }> {
    if (OneScanVision && pages.every((p) => p.filterApplied)) {
      const r = await OneScanVision.writePdfAsync(pages.map((p) => p.uri));
      return { uri: r.uri, pageCount: r.pageCount };
    }
    const inputs: PdfPageInput[] = [];
    for (const p of pages) {
      const b64 = await DocumentFileStore.readBase64(p.uri);
      inputs.push({ ...p, dataUri: `data:image/jpeg;base64,${b64}` });
    }
    const { uri, numberOfPages } = await Print.printToFileAsync({
      html: buildPdfHtml(inputs, title),
      width: A4.width,
      height: A4.height,
      margins: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    return { uri, pageCount: numberOfPages };
  },
};
