import type { GrayImage } from '@/core/document-engine/capture/quadDetector';
import type { Point } from '@/core/document-engine/model';

/** Deterministic PRNG so scenes are stable across runs. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function inside(poly: Point[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export interface SceneLayer {
  poly: Point[];
  /** Luminance, or a function of (x, y). */
  value: number | ((x: number, y: number) => number);
  /** Add dark text-like strokes inside. */
  text?: boolean;
}

/**
 * Camera-like scene: textured floor with grout lines and lighting gradient,
 * then layers painted in order (shadows, objects, pages).
 */
export function scene(
  w: number,
  h: number,
  layers: SceneLayer[],
  opts: { floor?: number; grout?: number; tile?: number; light?: (x: number, y: number) => number; noise?: number; seed?: number } = {},
): GrayImage {
  const r = rng(opts.seed ?? 7);
  const data = new Uint8Array(w * h);
  const tile = opts.tile ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = opts.floor ?? 210;
      // marble-ish low-frequency texture
      v += Math.sin(x * 0.21 + y * 0.07) * 6 + Math.sin(x * 0.05 - y * 0.13) * 8;
      if (tile && (x % tile === 0 || y % tile === 0)) v = opts.grout ?? 160;
      for (const l of layers) {
        if (!inside(l.poly, x, y)) continue;
        v = typeof l.value === 'function' ? l.value(x, y) : l.value;
        if (l.text && y % 8 < 2 && x % 11 < 7) v = Math.min(v, 45);
      }
      v *= opts.light ? opts.light(x, y) : 1;
      v += (r() - 0.5) * (opts.noise ?? 12);
      data[y * w + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { width: w, height: h, data };
}

/**
 * Composite an anti-aliased page (4× supersampled, box-downsampled like a
 * camera) onto a background frame, optionally with a soft shadow polygon.
 */
export function composite(
  bg: GrayImage,
  opts: { page?: Point[]; paper?: number; text?: boolean; shadow?: Point[]; shadowDepth?: number; noise?: number; seed?: number },
): GrayImage {
  const { width: w, height: h } = bg;
  const r = rng(opts.seed ?? 5);
  const SS = 4;
  const out = new Uint8Array(w * h);
  const xs = opts.page?.map((p) => p.x) ?? [0];
  const ys = opts.page?.map((p) => p.y) ?? [0];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  // Text block = page shrunk towards its centre (real documents have margins).
  const cx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const cy = ys.reduce((a, v) => a + v, 0) / ys.length;
  const textArea = opts.page?.map((p) => ({ x: cx + (p.x - cx) * 0.82, y: cy + (p.y - cy) * 0.86 }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let base = bg.data[y * w + x];
      if (opts.shadow) {
        // soft shadow: fraction of a 5×5 neighbourhood inside the polygon
        let f = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inside(opts.shadow, x + dx, y + dy)) f++;
        base *= 1 - (f / 25) * (opts.shadowDepth ?? 0.45);
      }
      if (!opts.page) {
        out[y * w + x] = Math.max(0, Math.min(255, Math.round(base + (r() - 0.5) * (opts.noise ?? 5))));
        continue;
      }
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - 0.5;
          const py = y + (sy + 0.5) / SS - 0.5;
          let v = base;
          if (inside(opts.page, px, py)) {
            v = opts.paper ?? 240;
            const row = (py - minY - 12) % 8;
            if (opts.text !== false && row >= 0 && row < 1.2 && textArea && inside(textArea, px, py) && px < maxX - 16 && px > minX) v = 60;
          }
          acc += v;
        }
      }
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(acc / (SS * SS) + (r() - 0.5) * (opts.noise ?? 5))));
    }
  }
  return { width: w, height: h, data: out };
}
