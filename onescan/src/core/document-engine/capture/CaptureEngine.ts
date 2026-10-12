import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';
import { maskToQuad } from './docSeg';
import { base64ToUint8, boxBlur, decodeGray, detectQuad, GrayImage, QuadDetection, refineQuad, sharpnessOf, sobel } from './quadDetector';

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
/** A mask quad is good to about one mask pixel (1/64 of the frame ≈ 10 px at 640). */
const MASK_REFINE_SEARCH = 10;

/**
 * Quad from the native DocSeg page mask (learned segmentation), with the frame's
 * brightness/sharpness for the capture hints. Null mask → no document.
 */
export function detectFromMask(img: GrayImage, maskB64: string): QuadDetection {
  let sum = 0;
  for (let i = 0; i < img.data.length; i++) sum += img.data[i];
  const brightness = img.data.length ? sum / img.data.length / 255 : 0;
  const sharpness = sharpnessOf(img);
  const raw = base64ToUint8(maskB64);
  const prob = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) prob[i] = raw[i] / 255;
  const r = maskToQuad(prob, Math.round(Math.sqrt(raw.length)));
  return { quad: r?.quad ?? null, confidence: r?.confidence ?? 0, brightness, sharpness };
}

/**
 * Document boundary detection. Live preview frames and captured stills carry a
 * page mask from the on-device DocSeg model when the native module has it; the
 * mask is turned into a quad here (`docSeg.maskToQuad`). Without a mask, the
 * classical edge detector (`quadDetector`) is used.
 */
export const CaptureEngine = {
  hasNativeVision: () => OneScanVision !== null,

  detectFrame(frame: { width: number; height: number; data: string; cb?: string; cr?: string; mask?: string }): QuadDetection {
    const img = decodeGray(frame.width, frame.height, frame.data, frame.cb, frame.cr);
    return frame.mask ? detectFromMask(img, frame.mask) : detectQuad(img);
  },

  async detect(imageUri: string): Promise<DetectionResult> {
    if (!OneScanVision) {
      return { quad: fullFrameQuad, detected: false, confidence: 0, brightness: 1, sharpness: 1 };
    }
    const g = await OneScanVision.grayscaleAsync(imageUri, DETECT_EDGE, true);
    const small = decodeGray(g.width, g.height, g.data, g.cb, g.cr);
    const d = g.mask ? detectFromMask(small, g.mask) : detectQuad(small);
    let quad = d.quad;
    if (quad) {
      try {
        const big = await OneScanVision.grayscaleAsync(imageUri, REFINE_EDGE);
        const img = decodeGray(big.width, big.height, big.data);
        const mag = sobel(boxBlur(img.data, img.width, img.height, 1), img.width, img.height).mag;
        const px = quad.map((p) => ({ x: p.x * (img.width - 1), y: p.y * (img.height - 1) }));
        const refined = refineQuad(px, mag, img.width, img.height, g.mask ? MASK_REFINE_SEARCH : 6);
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
