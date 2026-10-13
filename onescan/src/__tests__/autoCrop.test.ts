import { decisionFor, detectDocument, textSafeQuad } from '@/core/document-engine/capture/crop/documentCrop';
import { cellMap } from '@/core/document-engine/capture/crop/cellMap';
import type { GrayImage } from '@/core/document-engine/capture/quadDetector';
import type { Point, Quad } from '@/core/document-engine/model';

const W = 288;
const H = 384;

function inside(q: Point[], x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Page corners (px), slightly rotated, ~45% of the frame. */
function pageCorners(cx: number, cy: number, w: number, h: number, angle: number): Point[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const x = (sx * w) / 2;
    const y = (sy * h) / 2;
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  });
}

/**
 * The reported failure: a printed page in the middle of a marble floor with strong grout
 * lines (big, straight, high-contrast rectangles) and veins. Deterministic.
 */
function marbleScene(surface: 'marble' | 'wood' | 'dark' | 'white'): { img: GrayImage; page: Point[] } {
  const page = pageCorners(W * 0.52, H * 0.5, W * 0.56, H * 0.56, 0.09);
  // Page frame (u, w in 0..1 across and down the page) for text layout.
  const [tl, tr, , bl] = page;
  const ax = { x: tr.x - tl.x, y: tr.y - tl.y };
  const ay = { x: bl.x - tl.x, y: bl.y - tl.y };
  const a2 = ax.x * ax.x + ax.y * ax.y;
  const b2 = ay.x * ay.x + ay.y * ay.y;
  const y = new Uint8Array(W * H);
  const cb = new Uint8Array(W * H);
  const cr = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      let v: number;
      let b = 128;
      let r = 128;
      if (surface === 'marble') {
        const vein = Math.abs(Math.sin((px * 0.021 + py * 0.013 + 3 * Math.sin(py * 0.05) + 2 * Math.sin(px * 0.031)) * Math.PI)) < 0.05;
        const grout = (px + 40) % 150 < 3 || (py + 25) % 150 < 3;
        v = 214 - (vein ? 55 : 0) - (grout ? 70 : 0) - 8 * Math.sin(px * 0.11) * Math.sin(py * 0.07);
      } else if (surface === 'wood') {
        v = 120 + 30 * Math.sin(px * 0.08 + 4 * Math.sin(py * 0.02)) - ((py + 10) % 90 < 2 ? 40 : 0);
        b = 110;
        r = 150;
      } else if (surface === 'dark') {
        v = 45 + 6 * Math.sin(px * 0.05) * Math.sin(py * 0.04);
      } else {
        v = 232 + 4 * Math.sin(px * 0.03);
      }
      if (inside(page, px, py)) {
        // Page coordinates 0..1.
        const dx = px - tl.x;
        const dy = py - tl.y;
        const u = (dx * ax.x + dy * ax.y) / a2;
        const w = (dx * ay.x + dy * ay.y) / b2;
        v = 246;
        b = 126;
        r = 131;
        // Text: lines every ~2.3% of the page, words of varying length, 8% side margins.
        const line = Math.floor(w * 44);
        const inLine = w * 44 - line < 0.35;
        const word = Math.floor(u * 22 + line * 0.37);
        const gap = (u * 22 + line * 0.37) % 1 < 0.22 || (word * 7 + line * 3) % 9 === 0;
        if (u > 0.08 && u < 0.92 && w > 0.06 && w < 0.94 && inLine && !gap && (px * 3 + py) % 4 !== 0) v = 55;
      }
      y[i] = Math.max(0, Math.min(255, Math.round(v)));
      cb[i] = b;
      cr[i] = r;
    }
  }
  return { img: { width: W, height: H, data: y, cb, cr }, page };
}

const corners = (q: Quad) => q.map((p) => ({ x: p.x * W - 0.5, y: p.y * H - 0.5 }));

/** Worst corner distance as a share of the image diagonal (any corner order). */
function cornerError(q: Quad, truth: Point[]) {
  const px = corners(q);
  let best = Infinity;
  for (let s = 0; s < 4; s++) {
    for (const dir of [1, -1]) {
      let worst = 0;
      for (let i = 0; i < 4; i++) {
        const t = truth[(s + dir * i + 8) % 4];
        worst = Math.max(worst, Math.hypot(px[i].x - t.x, px[i].y - t.y));
      }
      best = Math.min(best, worst);
    }
  }
  return best / Math.hypot(W, H);
}

const area = (q: Quad) => Math.abs(q.reduce((a, p, i) => a + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;

function maskFrom(fn: (x: number, y: number) => number) {
  const m = new Float32Array(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) m[y * 64 + x] = fn(((x + 0.5) / 64) * W, ((y + 0.5) / 64) * H);
  return m;
}

describe('auto crop: marble_floor_document_false_positive', () => {
  const { img, page } = marbleScene('marble');

  it('finds the page, not the floor, without a page mask', () => {
    const r = detectDocument(img, null);
    expect(r.quad).not.toBeNull();
    expect(cornerError(r.quad!, page)).toBeLessThan(0.03);
    expect(area(r.quad!)).toBeLessThan(0.5);
  });

  it('finds the page when the segmentation mask covers the whole floor', () => {
    const r = detectDocument(img, maskFrom(() => 0.9));
    expect(r.quad).not.toBeNull();
    expect(cornerError(r.quad!, page)).toBeLessThan(0.03);
    // The floor candidate exists and loses.
    const floor = r.candidates.filter((c) => area(c.quad) > 0.85);
    expect(floor.length).toBeGreaterThan(0);
    for (const c of floor) expect(c.score).toBeLessThan(r.candidates[r.selected].score);
  });

  it('auto-applies a confident crop when the mask agrees', () => {
    const r = detectDocument(img, maskFrom((x, y) => (inside(page, x, y) ? 0.95 : 0.05)));
    expect(cornerError(r.quad!, page)).toBeLessThan(0.02);
    expect(r.decision).toBe('auto');
  });

  it.each(['wood', 'dark', 'white'] as const)('finds the page on %s', (surface) => {
    const s = marbleScene(surface);
    const r = detectDocument(s.img, maskFrom((x, y) => (inside(s.page, x, y) ? 0.9 : 0.1)));
    expect(cornerError(r.quad!, s.page)).toBeLessThan(0.03);
  });

  it('never crops a photo without a document', () => {
    const empty = marbleScene('marble').img;
    // Same floor, page painted over with floor texture: no text, no paper.
    const r = detectDocument({ ...empty, data: empty.data.map((v) => (v > 240 || v < 60 ? 200 : v)) }, maskFrom(() => 0.05));
    expect(r.decision).toBe('manual');
  });
});

describe('auto crop: gate and text margin', () => {
  it('maps confidence to auto / review / manual', () => {
    expect(decisionFor(0.9)).toBe('auto');
    expect(decisionFor(0.85)).toBe('auto');
    expect(decisionFor(0.7)).toBe('review');
    expect(decisionFor(0.65)).toBe('review');
    expect(decisionFor(0.5)).toBe('manual');
  });

  it('grows a side that would clip text, and leaves clear sides alone', () => {
    const { img, page } = marbleScene('white');
    // A crop whose right side cuts through the text block.
    const truth = page.map((p) => ({ x: (p.x + 0.5) / W, y: (p.y + 0.5) / H })) as Quad;
    const cut: Quad = [truth[0], { x: truth[1].x - 0.09, y: truth[1].y }, { x: truth[2].x - 0.09, y: truth[2].y }, truth[3]];
    const r = textSafeQuad(cut, cellMap(img, 8));
    const grownSides = r.grown.filter((g) => g > 0).length;
    expect(grownSides).toBeGreaterThanOrEqual(1);
    expect(Math.max(...r.grown)).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(r.quad[1].x).toBeGreaterThan(cut[1].x);
  });
});
