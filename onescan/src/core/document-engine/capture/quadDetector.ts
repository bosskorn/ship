import type { Point, Quad } from '../model';

/**
 * Document boundary detection on a small grayscale image (long edge ~160–320px).
 * Runs in JS on both platforms so live preview and post-capture detection use
 * the same, unit-tested algorithm. Native code only supplies luminance pixels.
 *
 * Pipeline: box blur → Otsu threshold (both polarities) → connected components →
 * convex hull → max-area inscribed quadrilateral → scoring.
 */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface QuadDetection {
  /** Normalised (0..1) TL, TR, BR, BL — or null when no document is found. */
  quad: Quad | null;
  confidence: number;
  brightness: number;
  sharpness: number;
}

export function decodeGray(width: number, height: number, base64: string): GrayImage {
  return { width, height, data: base64ToUint8(base64) };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToUint8(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 3 < clean.length + 3; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : -1;
    if (a < 0 || b < 0) break;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0 && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return dst;
}

export function otsu(data: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Variance of the Laplacian mapped to 0..1. Blank pages read low even when in focus. */
export function sharpnessOf(img: GrayImage): number {
  const { width: w, height: h, data } = img;
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  // Calibrated on 180×240 frames: crisp text ≈ 7k, one 3×3 blur pass ≈ 0.7k.
  return Math.min(1, variance / 2000);
}

interface Component {
  area: number;
  boundary: Point[];
}

function components(mask: Uint8Array, w: number, h: number, minArea: number): Component[] {
  const labels = new Int32Array(w * h);
  const out: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    const boundary: Point[] = [];
    while (sp) {
      const i = stack[--sp];
      area++;
      const x = i % w;
      const y = (i - x) / w;
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const nbs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nbs) {
        if (j < 0) continue;
        if (!mask[j]) {
          edge = true;
          continue;
        }
        if (!labels[j]) {
          labels[j] = next;
          stack[sp++] = j;
        }
      }
      if (edge) boundary.push({ x, y });
    }
    if (area >= minArea) out.push({ area, boundary });
    next++;
  }
  return out.sort((a, b) => b.area - a.area);
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Andrew's monotone chain; returns counter-clockwise hull without repetition. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const triArea = (a: Point, b: Point, c: Point) => Math.abs(cross(a, b, c)) / 2;

/** Largest-area quadrilateral with vertices on a convex polygon (O(n³), n ≤ 48). */
export function maxAreaQuad(hull: Point[]): Point[] | null {
  let poly = hull;
  if (poly.length < 4) return null;
  if (poly.length > 48) {
    const step = poly.length / 48;
    poly = Array.from({ length: 48 }, (_, i) => hull[Math.floor(i * step)]);
  }
  const n = poly.length;
  let best = -1;
  let result: Point[] | null = null;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      let bestJ = -1;
      let aJ = -1;
      for (let j = i + 1; j < k; j++) {
        const a = triArea(poly[i], poly[j], poly[k]);
        if (a > aJ) {
          aJ = a;
          bestJ = j;
        }
      }
      let bestL = -1;
      let aL = -1;
      for (let l = k + 1; l < n + i; l++) {
        const p = poly[l % n];
        const a = triArea(poly[k], p, poly[i]);
        if (a > aL) {
          aL = a;
          bestL = l % n;
        }
      }
      if (bestJ < 0 || bestL < 0) continue;
      if (aJ + aL > best) {
        best = aJ + aL;
        result = [poly[i], poly[bestJ], poly[k], poly[bestL]];
      }
    }
  }
  return result;
}

/** Orders any 4 points as TL, TR, BR, BL (clockwise in screen coordinates). */
export function orderQuad(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // atan2 ascending in screen space (y down) walks clockwise; rotate so TL (min x+y) is first.
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad;
}

function touchesBorders(q: Point[], w: number, h: number): number {
  const m = 2;
  let n = 0;
  if (q.some((p) => p.x <= m)) n++;
  if (q.some((p) => p.y <= m)) n++;
  if (q.some((p) => p.x >= w - 1 - m)) n++;
  if (q.some((p) => p.y >= h - 1 - m)) n++;
  return n;
}

export function detectQuad(img: GrayImage): QuadDetection {
  const { width: w, height: h, data } = img;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const brightness = data.length ? sum / data.length / 255 : 0;
  const sharpness = sharpnessOf(img);
  const empty = { quad: null, confidence: 0, brightness, sharpness };
  if (w < 16 || h < 16) return empty;

  const blurred = boxBlur(boxBlur(data, w, h, Math.max(1, Math.round(Math.min(w, h) / 120))), w, h, 1);
  const t = otsu(blurred);
  // Contrast check: no meaningful foreground/background split → nothing to find.
  let lo = 0;
  let hi = 0;
  let nLo = 0;
  let nHi = 0;
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] > t) {
      hi += blurred[i];
      nHi++;
    } else {
      lo += blurred[i];
      nLo++;
    }
  }
  if (!nLo || !nHi || hi / nHi - lo / nLo < 25) return empty;

  const imageArea = w * h;
  let best: { quad: Point[]; score: number } | null = null;
  for (const bright of [true, false]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < blurred.length; i++) mask[i] = (blurred[i] > t) === bright ? 1 : 0;
    for (const comp of components(mask, w, h, imageArea * 0.08).slice(0, 3)) {
      const hull = convexHull(comp.boundary);
      const hullArea = polygonArea(hull);
      const quad = maxAreaQuad(hull);
      if (!quad || hullArea <= 0) continue;
      const quadArea = polygonArea(quad);
      const size = quadArea / imageArea;
      if (size < 0.1 || size > 0.97) continue;
      if (touchesBorders(quad, w, h) >= 3) continue; // that's background, not a page
      const quadness = quadArea / hullArea; // ~1 for 4-sided shapes
      const score = Math.max(0, (quadness - 0.82) / 0.18) * Math.min(1, size / 0.25);
      if (!best || score > best.score) best = { quad, score };
    }
  }
  if (!best || best.score <= 0) return empty;
  const norm = orderQuad(best.quad.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })));
  return { quad: norm, confidence: Math.min(1, best.score), brightness, sharpness };
}

/**
 * Map a normalised quad from a camera frame onto a preview that uses
 * aspect-fill (cover) scaling, returning view-space pixels.
 */
export function frameQuadToView(quad: Quad, frame: { width: number; height: number }, view: { width: number; height: number }): Point[] {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const dx = (view.width - frame.width * scale) / 2;
  const dy = (view.height - frame.height * scale) / 2;
  return quad.map((p) => ({ x: p.x * frame.width * scale + dx, y: p.y * frame.height * scale + dy }));
}
