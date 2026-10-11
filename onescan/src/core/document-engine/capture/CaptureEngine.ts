import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';

export const fullFrameQuad: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export interface DetectionResult {
  quad: Quad;
  /** False when no native detector exists and the full frame is used. */
  detected: boolean;
  confidence: number;
  brightness: number;
  sharpness: number;
}

/**
 * Document boundary detection on a captured still. Live-preview detection
 * (for the on-camera border and auto capture) runs in the native module and
 * feeds `AutoCaptureController`.
 */
export const CaptureEngine = {
  hasNativeDetection: () => OneScanVision !== null,

  async detect(imageUri: string): Promise<DetectionResult> {
    if (!OneScanVision) {
      return { quad: fullFrameQuad, detected: false, confidence: 0, brightness: 1, sharpness: 1 };
    }
    const d = await OneScanVision.detectDocumentAsync(imageUri);
    return {
      quad: d.quad ?? fullFrameQuad,
      detected: d.quad !== null,
      confidence: d.confidence,
      brightness: d.brightness,
      sharpness: d.sharpness,
    };
  },
};
