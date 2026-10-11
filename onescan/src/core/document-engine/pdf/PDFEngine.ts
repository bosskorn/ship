import * as Print from 'expo-print';
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
 * Local PDF generation via the platform print engine (WebKit/Android WebView
 * renderer — offline, no upload). A streaming native PDF writer can replace
 * this for 100+ page documents without changing callers.
 */
export const PDFEngine = {
  async create(pages: PdfSourcePage[], title: string): Promise<{ uri: string; pageCount: number }> {
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
