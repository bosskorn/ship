import { OneScanVision, NativeOcrBlock } from '@/native/OneScanVision';

export interface OcrPageResult {
  text: string;
  blocks: NativeOcrBlock[];
}

export interface OcrResult {
  available: boolean;
  pages: OcrPageResult[];
  text: string;
}

/**
 * On-device OCR first (spec §16). Cloud "Advanced OCR" is a separate AIEngine
 * task that requires consent — this engine never touches the network.
 */
export const OCREngine = {
  isAvailable: () => OneScanVision !== null,

  async recognize(
    imageUris: string[],
    languages: string[] = ['th', 'en'],
    onProgress?: (done: number, total: number) => void,
  ): Promise<OcrResult> {
    if (!OneScanVision) return { available: false, pages: [], text: '' };
    const pages: OcrPageResult[] = [];
    // Page-by-page to bound memory on long documents (spec §53).
    for (let i = 0; i < imageUris.length; i++) {
      const blocks = await OneScanVision.recognizeTextAsync(imageUris[i], languages);
      pages.push({ blocks, text: blocks.map((b) => b.text).join('\n') });
      onProgress?.(i + 1, imageUris.length);
    }
    return { available: true, pages, text: pages.map((p) => p.text).join('\n\n') };
  },
};
