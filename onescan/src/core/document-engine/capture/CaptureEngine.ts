import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';
import { maskToQuad } from './docSeg';
import { CropDecision, CropResult, decisionFor, detectDocument, DocPrior, textSafeQuad, ZoomMask, zoomRegion } from './crop/documentCrop';
import { cellMap } from './crop/cellMap';
import { base64ToUint8, decodeGray, detectQuad, GrayImage, QuadDetection, sharpnessOf } from './quadDetector';

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
  /** Post-capture crop gate: auto-apply, apply and suggest a check, or suggest only. */
  decision: CropDecision;
  /** Best outline even when it is not applied (`decision` = manual), for the crop editor. */
  suggestion?: Quad;
  /** Why this crop (dev diagnostics): numbers only. */
  debug?: CropDebug;
}

export interface CropDebug {
  candidates: number;
  selected: string;
  area: number;
  textCoverage: number;
  textDensity: number;
  paperScore: number;
  edgeScore: number;
  backgroundPenalty: number;
  confidence: number;
  decision: CropDecision;
  marginGrown: boolean;
  ms: number;
}

/** Post-capture analysis size (candidates, text map, features). */
const ANALYSIS_EDGE = 384;
/** Zoomed second pass resolution (region long edge). */
const ZOOM_EDGE = 256;

function debugOf(r: CropResult, marginGrown: boolean, started: number): CropDebug {
  const c = r.candidates[r.selected];
  const f = c?.features;
  return {
    candidates: r.candidates.length,
    selected: c ? `${c.source}_${r.selected}` : 'none',
    area: f?.area ?? 0,
    textCoverage: f?.textRecall ?? 0,
    textDensity: f?.textDensity ?? 0,
    paperScore: f ? Math.max(0, 1 - f.paperTexture / 0.2) : 0,
    edgeScore: f?.edgeMean ?? 0,
    backgroundPenalty: f?.backgroundPenalty ?? 0,
    confidence: r.confidence,
    decision: r.decision,
    marginGrown,
    ms: Date.now() - started,
  };
}

/**
 * Quad from the native DocSeg page mask (learned segmentation), with the frame's
 * brightness/sharpness for the capture hints. Null mask → no document.
 */
export function detectFromMask(img: GrayImage, maskB64: string): QuadDetection {
  let sum = 0;
  for (let i = 0; i < img.data.length; i++) sum += img.data[i];
  const brightness = img.data.length ? sum / img.data.length / 255 : 0;
  const sharpness = sharpnessOf(img);
  const r = maskQuad(maskB64);
  return { quad: r?.quad ?? null, confidence: r?.confidence ?? 0, brightness, sharpness };
}

function maskQuad(maskB64: string) {
  const raw = base64ToUint8(maskB64);
  const prob = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) prob[i] = raw[i] / 255;
  return maskToQuad(prob, Math.round(Math.sqrt(raw.length)));
}

/** A live camera frame: mask + stats from native, or raw planes when there is no model. */
export interface LiveFrame {
  width: number;
  height: number;
  data?: string;
  cb?: string;
  cr?: string;
  mask?: string;
  brightness?: number;
  sharpness?: number;
}

/**
 * Document boundary detection. Live preview frames and captured stills carry a
 * page mask from the on-device DocSeg model when the native module has it; the
 * mask is turned into a quad here (`docSeg.maskToQuad`). Without a mask, the
 * classical edge detector (`quadDetector`) is used.
 */
export const CaptureEngine = {
  hasNativeVision: () => OneScanVision !== null,

  /**
   * Live frame → quad. Native builds send only the DocSeg mask plus brightness/sharpness
   * computed on the camera thread, so this is a 64×64 mask walk; raw planes (and the
   * classical detector) are only used when the model is missing.
   */
  detectFrame(frame: LiveFrame): QuadDetection {
    if (frame.mask && frame.brightness !== undefined && frame.sharpness !== undefined) {
      const r = maskQuad(frame.mask);
      return { quad: r?.quad ?? null, confidence: r?.confidence ?? 0, brightness: frame.brightness, sharpness: frame.sharpness };
    }
    if (!frame.data) return { quad: null, confidence: 0, brightness: frame.brightness ?? 0, sharpness: frame.sharpness ?? 0 };
    const img = decodeGray(frame.width, frame.height, frame.data, frame.cb, frame.cr);
    return frame.mask ? detectFromMask(img, frame.mask) : detectQuad(img);
  },

  /**
   * Post-capture document crop on the captured photo itself (never the preview box):
   * downscaled analysis image + DocSeg page mask → scored candidates (crop/documentCrop)
   * (raw and edge-snapped outlines) → text safe margin → confidence gate.
   */
  async detect(imageUri: string, prior: DocPrior = null): Promise<DetectionResult> {
    const none: DetectionResult = { quad: fullFrameQuad, detected: false, confidence: 0, brightness: 1, sharpness: 1, decision: 'manual' };
    if (!OneScanVision) return none;
    const started = Date.now();
    const g = await OneScanVision.grayscaleAsync(imageUri, ANALYSIS_EDGE, true);
    const img = decodeGray(g.width, g.height, g.data, g.cb, g.cr);
    let mask: Float32Array | null = null;
    if (g.mask) {
      const raw = base64ToUint8(g.mask);
      mask = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) mask[i] = raw[i] / 255;
    }
    // Small page in the frame: segment again on a zoomed crop around it.
    let zoom: ZoomMask | null = null;
    const region = mask ? zoomRegion(mask) : null;
    if (region && OneScanVision.grayscaleRegionAsync) {
      try {
        const z = await OneScanVision.grayscaleRegionAsync(imageUri, region, ZOOM_EDGE, true);
        if (z.mask) {
          const raw = base64ToUint8(z.mask);
          const zm = new Float32Array(raw.length);
          for (let i = 0; i < raw.length; i++) zm[i] = raw[i] / 255;
          zoom = { mask: zm, n: Math.round(Math.sqrt(raw.length)), region };
        }
      } catch {
        // First pass only.
      }
    }
    const r = detectDocument(img, mask, undefined, prior, zoom);
    let brightness = 0;
    for (let i = 0; i < img.data.length; i++) brightness += img.data[i];
    brightness = img.data.length ? brightness / img.data.length / 255 : 0;
    const sharpness = sharpnessOf(img);
    if (!r.quad) return { ...none, brightness, sharpness, debug: debugOf(r, false, started) };
    // Corners are already snapped to the paper edges (refined candidates, crop/documentCrop).
    let quad: Quad = r.quad;
    // Never clip text at the edges: grow a side that has text on or just past it.
    const safe = textSafeQuad(quad, cellMap(img, 8));
    quad = safe.quad;
    const decision = decisionFor(r.confidence);
    return {
      quad: decision === 'manual' ? fullFrameQuad : quad,
      detected: decision !== 'manual',
      confidence: r.confidence,
      brightness,
      sharpness,
      decision,
      suggestion: quad,
      debug: debugOf(r, safe.grown.some((v) => v > 0), started),
    };
  },
};
