import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';
import { boxBlur, decodeGray, detectQuad, QuadDetection, refineQuad, sobel } from './quadDetector';

export const fullFrameQuad: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export interface DetectionResult {
  quad: Quad;
  /** False when no document was found (or no native pixels) and the full frame is used. */
  detected: boolean;
  confidence: number;
  brightness: number;
  sharpness: number;
}

/** Detection runs at the live-preview scale (what the detector is tuned for)… */
const DETECT_EDGE = 192;
/** …then corners are refined on a sharper copy for an accurate crop. */
const REFINE_EDGE = 640;

/**
 * Document boundary detection. Live preview frames and captured stills both go
 * through the same JS detector (`quadDetector`); native code only supplies pixels.
 */
export const CaptureEngine = {
  hasNativeVision: () => OneScanVision !== null,

  detectFrame(frame: { width: number; height: number; data: string }): QuadDetection {
    return detectQuad(decodeGray(frame.width, frame.height, frame.data));
  },

  async detect(imageUri: string): Promise<DetectionResult> {
    if (!OneScanVision) {
      return { quad: fullFrameQuad, detected: false, confidence: 0, brightness: 1, sharpness: 1 };
    }
    const g = await OneScanVision.grayscaleAsync(imageUri, DETECT_EDGE);
    const d = detectQuad(decodeGray(g.width, g.height, g.data));
    let quad = d.quad;
    if (quad) {
      try {
        const big = await OneScanVision.grayscaleAsync(imageUri, REFINE_EDGE);
        const img = decodeGray(big.width, big.height, big.data);
        const mag = sobel(boxBlur(img.data, img.width, img.height, 1), img.width, img.height).mag;
        const px = quad.map((p) => ({ x: p.x * (img.width - 1), y: p.y * (img.height - 1) }));
        const refined = refineQuad(px, mag, img.width, img.height, 6);
        quad = refined.map((p) => ({ x: p.x / (img.width - 1), y: p.y / (img.height - 1) })) as Quad;
      } catch {
        // Keep the coarse quad.
      }
    }
    return {
      quad: quad ?? fullFrameQuad,
      detected: d.quad !== null,
      confidence: d.confidence,
      brightness: d.brightness,
      sharpness: d.sharpness,
    };
  },
};
