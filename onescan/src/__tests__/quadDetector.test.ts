import { convexHull, detectQuad, frameQuadToView, GrayImage, maxAreaQuad, orderQuad, base64ToUint8 } from '@/core/document-engine/capture/quadDetector';
import { bytesToBase64 } from '@/core/document-engine/security/SecurityEngine';
import { composite, inside as insidePoly, rng as seeded } from './fixtures/scenes';
import { REAL_FLOOR, USER_SCENE } from './fixtures/realScenes';
import type { Point } from '@/core/document-engine/model';

/** Deterministic PRNG so tests are stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function inside(poly: Point[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function synth(w: number, h: number, poly: Point[], fg: number, bg: number, opts: { text?: boolean; noise?: number } = {}): GrayImage {
  const r = rng(42);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = inside(poly, x, y) ? fg : bg;
      // "Text" lines inside the page: dark strokes that must not break detection.
      if (opts.text && inside(poly, x, y) && y % 9 < 2 && x % 13 < 9) v = 40;
      v += (r() - 0.5) * (opts.noise ?? 20);
      data[y * w + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { width: w, height: h, data };
}

function expectCorners(quad: Point[] | null, truth: Point[], w: number, h: number, tolPx = 4) {
  expect(quad).not.toBeNull();
  quad!.forEach((p, i) => {
    expect(Math.abs(p.x * (w - 1) - truth[i].x)).toBeLessThanOrEqual(tolPx);
    expect(Math.abs(p.y * (h - 1) - truth[i].y)).toBeLessThanOrEqual(tolPx);
  });
}

describe('detectQuad', () => {
  const W = 180;
  const H = 240;

  it('finds an axis-aligned bright page with text on a dark table', () => {
    const truth = [{ x: 30, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 200 }, { x: 30, y: 200 }];
    const d = detectQuad(synth(W, H, truth, 225, 60, { text: true }));
    expectCorners(d.quad, truth, W, H);
    expect(d.confidence).toBeGreaterThan(0.7);
  });

  it('handles rotation and perspective skew', () => {
    const truth = [{ x: 50, y: 30 }, { x: 160, y: 55 }, { x: 140, y: 215 }, { x: 20, y: 190 }];
    const d = detectQuad(synth(W, H, truth, 210, 70, { text: true }));
    expectCorners(d.quad, truth, W, H);
  });

  it('finds a dark page on a light background', () => {
    const truth = [{ x: 40, y: 50 }, { x: 140, y: 45 }, { x: 145, y: 190 }, { x: 35, y: 195 }];
    const d = detectQuad(synth(W, H, truth, 50, 230));
    expectCorners(d.quad, truth, W, H);
  });

  it('returns null for an empty scene', () => {
    const d = detectQuad(synth(W, H, [], 0, 128, { noise: 30 }));
    expect(d.quad).toBeNull();
    expect(d.confidence).toBe(0);
  });

  it('rejects a region that is the whole frame', () => {
    const truth = [{ x: 0, y: 0 }, { x: W - 1, y: 0 }, { x: W - 1, y: H - 1 }, { x: 0, y: H - 1 }];
    expect(detectQuad(synth(W, H, truth, 220, 40)).quad).toBeNull();
  });

  it('reports brightness and much lower sharpness for blurred frames', () => {
    const truth = [{ x: 30, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 200 }, { x: 30, y: 200 }];
    const img = synth(W, H, truth, 225, 60, { text: true, noise: 0 });
    const blurred = { ...img, data: new Uint8Array(img.data) };
    for (let pass = 0; pass < 2; pass++) {
      const src = new Uint8Array(blurred.data);
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * W + x + dx];
          blurred.data[y * W + x] = s / 9;
        }
    }
    const a = detectQuad(img);
    const b = detectQuad(blurred);
    expect(a.sharpness).toBe(1);
    expect(b.sharpness).toBeLessThan(0.3);
    expect(b.quad).not.toBeNull(); // still detectable, just not crisp enough to auto-fire
    expect(a.brightness).toBeGreaterThan(0.3);
  });
});

describe('real-world scenes (marble floor from a device photo)', () => {
  const floor = { width: REAL_FLOOR.width, height: REAL_FLOOR.height, data: base64ToUint8(REAL_FLOOR.base64) };
  const W = REAL_FLOOR.width;
  const H = REAL_FLOOR.height;

  it('regression: object running off the frame with a shadow is NOT a document', () => {
    const d = detectQuad({ width: USER_SCENE.width, height: USER_SCENE.height, data: base64ToUint8(USER_SCENE.base64) });
    expect(d.quad).toBeNull();
  });

  it('finds a white page on a light marble floor', () => {
    const page = [{ x: 30, y: 32 }, { x: 116, y: 44 }, { x: 110, y: 160 }, { x: 22, y: 150 }];
    expectCorners(detectQuad(composite(floor, { page, paper: 245 })).quad, page, W, H, 4);
  });

  it('picks the page, not the shadow next to it', () => {
    const page = [{ x: 35, y: 25 }, { x: 122, y: 42 }, { x: 108, y: 145 }, { x: 25, y: 128 }];
    const shadow = [{ x: 25, y: 128 }, { x: 108, y: 145 }, { x: 100, y: 191 }, { x: 0, y: 191 }, { x: 0, y: 138 }];
    expectCorners(detectQuad(composite(floor, { page, shadow })).quad, page, W, H, 4);
  });

  it('rejects a page that is cut off by the frame', () => {
    const page = [{ x: -25, y: 40 }, { x: 95, y: 45 }, { x: 90, y: 170 }, { x: -30, y: 160 }];
    expect(detectQuad(composite(floor, { page })).quad).toBeNull();
  });

  it('never invents a document on an empty floor', () => {
    expect(detectQuad(composite(floor, {})).quad).toBeNull();
  });

  it('uses tint when paper and floor have the same brightness (room lighting)', () => {
    // Device photo finding: under indoor light a white invoice on light marble
    // differed from the floor by ~0 luminance on one side but clearly in Cb.
    const page = [{ x: 28, y: 30 }, { x: 118, y: 40 }, { x: 112, y: 160 }, { x: 22, y: 152 }];
    let mean = 0;
    for (const v of floor.data) mean += v;
    mean /= floor.data.length;
    const lum = composite(floor, { page, paper: Math.round(mean) + 4 });
    const cb = new Uint8Array(W * H).fill(128);
    const cr = new Uint8Array(W * H).fill(128);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (insidePoly(page, x, y)) {
          cb[y * W + x] = 141; // bluish paper
          cr[y * W + x] = 124;
        }
    expect(detectQuad(lum).quad).toBeNull(); // brightness alone is not enough
    expectCorners(detectQuad({ ...lum, cb, cr }).quad, page, W, H, 4);
  });

  it('benchmark: finds most random pages and has no false positives', () => {
    const r = seeded(99);
    let found = 0;
    let falsePositives = 0;
    const N = 8;
    for (let i = 0; i < N; i++) {
      const cx = 60 + r() * 25;
      const cy = 85 + r() * 25;
      const pw = 60 + r() * 35;
      const ph = 80 + r() * 50;
      const a = ((r() - 0.5) * 40 * Math.PI) / 180;
      const page = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const x = (sx * pw) / 2;
        const y = (sy * ph) / 2;
        return { x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) };
      });
      const d = detectQuad(composite(floor, { page, paper: 240 + r() * 12, seed: i }));
      if (d.quad && d.quad.every((p, k) => Math.hypot(p.x * (W - 1) - page[k].x, p.y * (H - 1) - page[k].y) <= 5)) found++;
      // Same page shifted so it runs off the frame: must be rejected.
      const cut = page.map((p) => ({ x: p.x + (i % 2 ? 70 : -70), y: p.y }));
      if (detectQuad(composite(floor, { page: cut, seed: i })).quad) falsePositives++;
    }
    expect(falsePositives).toBe(0);
    expect(found / N).toBeGreaterThanOrEqual(0.75);
  });
});

describe('geometry helpers', () => {
  it('orders corners TL, TR, BR, BL regardless of input order', () => {
    const q = orderQuad([{ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]);
    expect(q).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  });

  it('max-area quad of an octagon picks 4 of its vertices', () => {
    const oct = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4) * 10, y: Math.sin((i * Math.PI) / 4) * 10 }));
    const q = maxAreaQuad(convexHull(oct))!;
    expect(q).toHaveLength(4);
  });

  it('maps frame coordinates through aspect-fill', () => {
    const q = orderQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    // 3:4 frame shown in a 300x300 view → width fits, height cropped by 50 each side.
    const v = frameQuadToView(q, { width: 300, height: 400 }, { width: 300, height: 300 });
    expect(v[0]).toEqual({ x: 0, y: -50 });
    expect(v[2]).toEqual({ x: 300, y: 350 });
  });

  it('decodes base64 luminance frames', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(Array.from(base64ToUint8(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
