import { OneScanVision, NativeOcrBlock } from '@/native/OneScanVision';
import { detectPii, PiiMatch, PiiType, summarizePii } from './piiDetector';
import { redactText } from './mask';

export * from './piiDetector';
export * from './mask';

/**
 * Redaction always happens on device (spec §66.3). The engine produces a
 * *copy*; originals are never modified or uploaded for redaction.
 */
export const RedactionEngine = {
  detect(text: string): PiiMatch[] {
    return detectPii(text);
  },

  summarize: summarizePii,

  redactText(text: string, matches: PiiMatch[], only?: Set<PiiType>): string {
    return redactText(text, matches, only);
  },

  /** Map text matches to OCR blocks that contain them, for image redaction. */
  blocksToRedact(blocks: NativeOcrBlock[], matches: PiiMatch[]): NativeOcrBlock['box'][] {
    const values = matches.map((m) => m.value.replace(/\s/g, ''));
    return blocks
      .filter((b) => {
        const t = b.text.replace(/\s/g, '');
        return values.some((v) => t.includes(v) || v.includes(t));
      })
      .map((b) => b.box);
  },

  async redactImage(imageUri: string, boxes: NativeOcrBlock['box'][]): Promise<string | null> {
    if (!OneScanVision || boxes.length === 0) return null;
    const { uri } = await OneScanVision.redactRegionsAsync(imageUri, boxes);
    return uri;
  },
};
