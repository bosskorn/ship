import type { Point, Quad } from '../model';
import type { CaptureHint } from './autoCapture';

/**
 * Capture-quality issues the scanner coach can report (Phase 1 infrastructure).
 * Detectors that don't exist yet (glare, shadow) simply never produce their issue.
 * `LOW_LIGHT` is an extension: the frame-brightness check already exists.
 */
export type QualityIssue =
  | 'NONE'
  | 'NO_DOCUMENT'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'BLUR'
  | 'GLARE'
  | 'SHADOW'
  | 'INCOMPLETE_EDGE'
  | 'UNSTABLE'
  | 'LOW_LIGHT'
  | 'READY';

export interface QualityInput {
  /** Smoothed live quad (normalised, frame space), null = no document. */
  quad: Quad | null;
  /** Auto-capture state machine hint for this frame. */
  hint: CaptureHint;
  /** Optional detector outputs; omitted = detector not available/enabled. */
  glare?: boolean;
  shadow?: boolean;
}

export interface QualityThresholds {
  /** Page smaller than this share of the frame = move closer. */
  minArea: number;
  /** Page larger than this share = move back (edges about to be cut). */
  maxArea: number;
  /** A corner this close (normalised) to the frame border counts as cut off. */
  edgeMargin: number;
}

export const defaultQualityThresholds: QualityThresholds = { minArea: 0.15, maxArea: 0.9, edgeMargin: 0.012 };

export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

const touchesBorder = (p: Point, m: number) => p.x <= m || p.y <= m || p.x >= 1 - m || p.y >= 1 - m;

/**
 * The single most important problem with the current frame — the coach shows one
 * message at a time. Order: framing first (no page, cut edge, distance), then light,
 * then reflections/shadows, then focus, then steadiness.
 */
export function qualityIssue(input: QualityInput, t: QualityThresholds = defaultQualityThresholds): QualityIssue {
  const { quad, hint } = input;
  if (!quad || hint === 'searching') return 'NO_DOCUMENT';
  if (quad.some((p) => touchesBorder(p, t.edgeMargin))) return 'INCOMPLETE_EDGE';
  const area = quadArea(quad);
  if (area < t.minArea) return 'TOO_FAR';
  if (area > t.maxArea) return 'TOO_CLOSE';
  if (hint === 'too_dark') return 'LOW_LIGHT';
  if (input.glare) return 'GLARE';
  if (input.shadow) return 'SHADOW';
  if (hint === 'blurry') return 'BLUR';
  if (hint === 'hold_still') return 'UNSTABLE';
  return 'READY';
}

/** Kind of page the live quad looks like, from its true (pixel) aspect ratio. */
export type PageShape = 'card' | 'page' | 'long';

/**
 * ID-1 cards (ID, driving licence, bank cards) are 85.6 × 54 mm = 1.586; A4 is 1.414,
 * Letter 1.29, receipts usually > 2. The card window is kept narrow so a tilted A4 page
 * isn't mistaken for a card. Corners are in normalised frame space; `frame` restores
 * the pixel aspect.
 */
export function pageShape(quad: Quad, frame: { width: number; height: number }): PageShape {
  const px = quad.map((p) => ({ x: p.x * frame.width, y: p.y * frame.height }));
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(px[0], px[1]) + d(px[3], px[2])) / 2;
  const h = (d(px[0], px[3]) + d(px[1], px[2])) / 2;
  const r = Math.max(w, h) / Math.max(1e-6, Math.min(w, h));
  if (r >= 1.52 && r <= 1.68) return 'card';
  if (r >= 2.0) return 'long';
  return 'page';
}
