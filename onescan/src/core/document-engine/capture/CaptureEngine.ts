import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';
import { decodeGray, detectQuad, QuadDetection } from './quadDetector';

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

/** Long edge of the grayscale image used for still-image detection. */
const STILL_EDGE = 320;

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
    const g = await OneScanVision.grayscaleAsync(imageUri, STILL_EDGE);
    const d = detectQuad(decodeGray(g.width, g.height, g.data));
    return {
      quad: d.quad ?? fullFrameQuad,
      detected: d.quad !== null,
      confidence: d.confidence,
      brightness: d.brightness,
      sharpness: d.sharpness,
    };
  },
};
