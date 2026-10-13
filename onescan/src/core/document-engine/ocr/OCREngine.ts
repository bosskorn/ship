import { OneScanVision, NativeOcrBlock } from '@/native/OneScanVision';

export interface OcrPageResult {
  text: string;
  blocks: NativeOcrBlock[];
}

export interface OcrResult {
  available: boolean;
  /** Pages whose OCR failed or timed out (saved without text). */
  failedPages?: number;
  pages: OcrPageResult[];
  text: string;
}

/**
 * On-device OCR first (spec §16). Cloud "Advanced OCR" is a separate AIEngine
 * task that requires consent — this engine never touches the network.
 */
/** One page of OCR may take a while on slow phones; past this the page is saved without text. */
const OCR_PAGE_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export const OCREngine = {
  isAvailable: () => OneScanVision !== null,

  async recognize(
    imageUris: string[],
    languages: string[] = ['th', 'en'],
    onProgress?: (done: number, total: number) => void,
  ): Promise<OcrResult> {
    if (!OneScanVision) return { available: false, pages: [], text: '' };
    const pages: OcrPageResult[] = [];
    let failed = 0;
    // Page-by-page to bound memory on long documents (spec §53). OCR is best-effort: a page
    // that fails or takes too long is saved without text — it never blocks saving the scan.
    for (let i = 0; i < imageUris.length; i++) {
      try {
        const blocks = await withTimeout(OneScanVision.recognizeTextAsync(imageUris[i], languages), OCR_PAGE_TIMEOUT_MS);
        pages.push({ blocks, text: blocks.map((b) => b.text).join('\n') });
      } catch {
        failed++;
        pages.push({ blocks: [], text: '' });
      }
      onProgress?.(i + 1, imageUris.length);
    }
    return { available: failed < imageUris.length, failedPages: failed, pages, text: pages.map((p) => p.text).join('\n\n') };
  },
};
