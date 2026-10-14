import { OneScanVision } from '@/native/OneScanVision';
import type { Quad } from '../model';
import { maskToQuad } from './docSeg';
import { CropDecision, CropResult, decisionFor, detectDocument, DocPrior, textSafeQuad, ZoomMask, zoomRegion } from './crop/documentCrop';
import { cellMap } from './crop/cellMap';
import { parsePresenceWeights, Presence, presenceGate, presenceProbability, PresenceWeights } from './crop/presence';
import { PRESENCE_THRESHOLDS, PRESENCE_WEIGHTS_B64 } from './crop/presenceWeights';
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
  /** Document presence gate (before segmentation). */
  presence?: Presence;
  presenceP?: number;
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
  presence?: Presence;
  presenceP?: number;
  zoom?: boolean;
}

function emptyDebug(started: number): CropDebug {
  return {
    candidates: 0,
    selected: 'none',
    area: 0,
    textCoverage: 0,
    textDensity: 0,
    paperScore: 0,
    edgeScore: 0,
    backgroundPenalty: 0,
    confidence: 0,
    decision: 'manual',
    marginGrown: false,
    ms: Date.now() - started,
  };
}

let presenceWeights: PresenceWeights | null | undefined;

/** Presence probability, or null when the gate's weights are not bundled. */
function documentPresence(img: GrayImage): number | null {
  if (presenceWeights === undefined) {
    try {
      presenceWeights = PRESENCE_WEIGHTS_B64 ? parsePresenceWeights(base64ToUint8(PRESENCE_WEIGHTS_B64)) : null;
    } catch {
      presenceWeights = null;
    }
  }
  return presenceWeights ? presenceProbability(img, presenceWeights) : null;
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
    let brightness = 0;
    for (let i = 0; i < img.data.length; i++) brightness += img.data[i];
    brightness = img.data.length ? brightness / img.data.length / 255 : 0;
    const sharpness = sharpnessOf(img);

    // 1. Presence gate: is there a document at all? "none" stops here — no crop, no suggestion.
    const presenceP = documentPresence(img);
    const presence: Presence = presenceP === null ? 'uncertain' : presenceGate(presenceP, PRESENCE_THRESHOLDS);
    if (presence === 'none') {
      return { ...none, brightness, sharpness, presence, presenceP: presenceP ?? undefined, debug: { ...emptyDebug(started), presence, presenceP: presenceP ?? -1 } };
    }

    // 2. Segmentation (first pass, whole photo).
    let mask: Float32Array | null = null;
    if (g.mask) {
      const raw = base64ToUint8(g.mask);
      mask = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) mask[i] = raw[i] / 255;
    }
    // Zoomed second pass only where it pays: a document is present, its page region is
    // small, and the first-pass region is not a clean page shape.
    let zoom: ZoomMask | null = null;
    const region = mask && presence === 'present' ? zoomRegion(mask) : null;
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

    // 3–4. Candidates + ranker.
    const r = detectDocument(img, mask, undefined, prior, zoom);
    const debug = { ...debugOf(r, false, started), presence, presenceP: presenceP ?? -1, zoom: zoom !== null };
    if (!r.quad) return { ...none, brightness, sharpness, presence, presenceP: presenceP ?? undefined, debug };
    // Never clip text at the edges: grow a side that has text on or just past it.
    const safe = textSafeQuad(r.quad, cellMap(img, 8));
    const quad: Quad = safe.quad;
    debug.marginGrown = safe.grown.some((v) => v > 0);

    // 5. Confidence gate: an uncertain presence never auto-applies.
    let decision = decisionFor(r.confidence);
    if (presence === 'uncertain' && decision === 'auto') decision = 'review';
    debug.decision = decision;
    return {
      quad: decision === 'manual' ? fullFrameQuad : quad,
      detected: decision !== 'manual',
      confidence: r.confidence,
      brightness,
      sharpness,
      decision,
      suggestion: quad,
      presence,
      presenceP: presenceP ?? undefined,
      debug,
    };
  },
};
