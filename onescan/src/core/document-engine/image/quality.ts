/**
 * Image tiers (v1.0.5). Each page keeps separate files:
 *   original  — scanner/camera JPEG, byte-for-byte, never re-encoded
 *   master    — full-resolution render (crop/rotate/filter), encoded once: viewer zoom,
 *               PDF, export, share, print
 *   preview   — ~1600 px, for fast on-screen display and the editor
 *   thumbnail — ~400 px, document list only
 * OCR decodes its own working copy natively (≤ ~2500 px) with normalised coordinates,
 * so it never forces the master down.
 */
export type ScanQuality = 'standard' | 'high' | 'maximum';

export interface QualityProfile {
  /** Long-edge cap in px; 0 = keep the source resolution. */
  maxEdge: number;
  /** JPEG quality 0–100 (encoded once). */
  quality: number;
}

export const masterProfiles: Record<ScanQuality, QualityProfile> = {
  standard: { maxEdge: 2200, quality: 88 },
  high: { maxEdge: 4000, quality: 95 },
  maximum: { maxEdge: 0, quality: 97 },
};

export const defaultScanQuality: ScanQuality = 'high';
export const PREVIEW: QualityProfile = { maxEdge: 1600, quality: 85 };
export const THUMBNAIL: QualityProfile = { maxEdge: 400, quality: 80 };

/** Up to this much over the cap is kept: resampling a few percent only blurs text. */
export const MASTER_SLACK = 1.15;

/**
 * Master size the native renderer produces for a source of this size (mirrors
 * `ImageIO.decodeForOutput` / `OneScanPageProcessor.process`). Never upscales.
 */
export function masterSize(src: { width: number; height: number }, p: QualityProfile): { width: number; height: number } {
  const long = Math.max(src.width, src.height);
  let target = p.maxEdge <= 0 || long <= p.maxEdge * MASTER_SLACK ? long : p.maxEdge;
  const k = target / long;
  const px = src.width * k * (src.height * k);
  if (px > MAX_OUTPUT_PIXELS) target = Math.floor(target * Math.sqrt(MAX_OUTPUT_PIXELS / px));
  if (target >= long) return { width: src.width, height: src.height };
  const s = target / long;
  return { width: Math.round(src.width * s), height: Math.round(src.height * s) };
}

/**
 * RAM ceiling for any rendered page (~26 MP ≈ 104 MB decoded): even "Maximum" renders a
 * 48/64 MP photo at ~26 MP rather than decoding it whole. Matches the camera's MAX cap.
 */
export const MAX_OUTPUT_PIXELS = 26_000_000;
