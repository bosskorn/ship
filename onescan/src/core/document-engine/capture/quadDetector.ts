import type { Point, Quad } from '../model';

/**
 * Document boundary detection on a small grayscale image (long edge ~160–320px).
 * Runs in JS on both platforms so live preview and post-capture detection use
 * the same, unit-tested algorithm. Native code only supplies luminance pixels.
 *
 * Pipeline:
 *  1. Candidates — (a) regions enclosed by gradient edges, (b) Otsu regions of
 *     both polarities. Each → convex hull → max-area inscribed quadrilateral.
 *  2. Validation — every side of a candidate must lie on real image edges
 *     ("edge support"). This rejects shapes that merge an object with a
 *     shadow or floor, and objects cut off by the frame.
 *  3. Score = shape quality × size × edge support; best wins.
 */
export interface GrayImage {
  width: number;
  height: number;
  /** Luminance (Y). */
  data: Uint8Array;
  /**
   * Optional chroma planes (Cb, Cr; 128 = neutral) at the same resolution.
   * White paper and a light floor often have nearly equal brightness but
   * different tint under room lighting; chroma recovers those edges.
   */
  cb?: Uint8Array;
  cr?: Uint8Array;
}

/** Chroma differences are smaller than luminance ones; scale them up. */
const CHROMA_GAIN = 2;

export interface QuadDetection {
  /** Normalised (0..1) TL, TR, BR, BL — or null when no document is found. */
  quad: Quad | null;
  confidence: number;
  brightness: number;
  sharpness: number;
}

export function decodeGray(width: number, height: number, base64: string, cb?: string, cr?: string): GrayImage {
  const img: GrayImage = { width, height, data: base64ToUint8(base64) };
  if (cb && cr) {
    img.cb = base64ToUint8(cb);
    img.cr = base64ToUint8(cr);
  }
  return img;
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

export function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
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
  /** Row extremes are enough for an exact convex hull (≤ 2 points per row). */
  extremes: Point[];
}

/** 4-connected components via an explicit stack; no per-pixel allocation. */
function components(mask: Uint8Array, w: number, h: number, minArea: number): Component[] {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const rowMin = new Int32Array(h);
  const rowMax = new Int32Array(h);
  const out: Component[] = [];
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    rowMin.fill(w);
    rowMax.fill(-1);
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    while (sp) {
      const i = stack[--sp];
      area++;
      const x = i % w;
      const y = (i - x) / w;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (x > 0 && mask[i - 1] && !labels[i - 1]) {
        labels[i - 1] = next;
        stack[sp++] = i - 1;
      }
      if (x < w - 1 && mask[i + 1] && !labels[i + 1]) {
        labels[i + 1] = next;
        stack[sp++] = i + 1;
      }
      if (y > 0 && mask[i - w] && !labels[i - w]) {
        labels[i - w] = next;
        stack[sp++] = i - w;
      }
      if (y < h - 1 && mask[i + w] && !labels[i + w]) {
        labels[i + w] = next;
        stack[sp++] = i + w;
      }
    }
    if (area >= minArea) {
      const extremes: Point[] = [];
      for (let y = 0; y < h; y++) {
        if (rowMax[y] < 0) continue;
        extremes.push({ x: rowMin[y], y });
        if (rowMax[y] !== rowMin[y]) extremes.push({ x: rowMax[y], y });
      }
      out.push({ area, extremes });
    }
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

interface Gradient {
  mag: Uint8Array;
  /** Gradient (edge-normal) direction in degrees, 0..180. */
  dir: Float32Array;
}

/** Sobel gradient magnitude (clamped to 0..255) and direction. */
export function sobel(src: Uint8Array, w: number, h: number): Gradient {
  const mag = new Uint8Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1] - src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1];
      const gy = src[i + w - 1] + 2 * src[i + w] + src[i + w + 1] - src[i - w - 1] - 2 * src[i - w] - src[i - w + 1];
      mag[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
      let d = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (d < 0) d += 180;
      if (d >= 180) d -= 180;
      dir[i] = d;
    }
  }
  return { mag, dir };
}

/** Per pixel, keep the gradient of whichever plane changes most there. */
function sobelMulti(planes: { data: Uint8Array; gain: number }[], w: number, h: number): Gradient {
  const out = sobel(planes[0].data, w, h);
  for (let p = 1; p < planes.length; p++) {
    const g = sobel(planes[p].data, w, h);
    const gain = planes[p].gain;
    for (let i = 0; i < out.mag.length; i++) {
      const m = Math.min(255, g.mag[i] * gain);
      if (m > out.mag[i]) {
        out.mag[i] = m;
        out.dir[i] = g.dir[i];
      }
    }
  }
  return out;
}

/** Non-maximum suppression: keep pixels that are a local max across the edge. */
export function thinEdges(g: Gradient, edges: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!edges[i]) continue;
      const d = g.dir[i];
      let o: number;
      if (d < 22.5 || d >= 157.5) o = 1;
      else if (d < 67.5) o = w + 1;
      else if (d < 112.5) o = w;
      else o = w - 1;
      const m = g.mag[i];
      if (m >= g.mag[i + o] && m >= g.mag[i - o]) out[i] = 1;
    }
  }
  return out;
}

/** 4 orientation bins (0°, 45°, 90°, 135° ± 22.5°) of edge pixels, each dilated by `r`. */
export function orientedNear(g: Gradient, edges: Uint8Array, w: number, h: number, r: number): Uint8Array[] {
  const bins = [0, 1, 2, 3].map(() => new Uint8Array(w * h));
  // Edge pixels are sparse: stamp each one's (2r+1)² neighbourhood directly
  // into its orientation bin(s) instead of dilating four full masks.
  const stamp = (b: Uint8Array, x: number, y: number) => {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(w - 1, x + r);
    for (let yy = y0; yy <= y1; yy++) b.fill(1, yy * w + x0, yy * w + x1 + 1);
  };
  for (let i = 0; i < edges.length; i++) {
    if (!edges[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const f = g.dir[i] / 45;
    stamp(bins[Math.round(f) % 4], x, y);
    // Near a boundary between two bins: count for both.
    const frac = f - Math.floor(f);
    if (frac > 0.3 && frac < 0.7) {
      stamp(bins[Math.floor(f) % 4], x, y);
      stamp(bins[Math.ceil(f) % 4], x, y);
    }
  }
  return bins;
}

interface HoughLine {
  theta: number; // degrees, normal direction
  rho: number;
  votes: number;
}

/**
 * Orientation-guided Hough transform: each thin edge pixel votes only for
 * lines whose normal is close to its gradient direction. Robust to gaps in
 * low-contrast page edges (white paper on light surfaces).
 */
export function houghLines(g: Gradient, thin: Uint8Array, w: number, h: number, maxLines: number): HoughLine[] {
  const T = 90; // 2° steps
  const diag = Math.ceil(Math.hypot(w, h));
  const R = 2 * diag + 1;
  const acc = new Float32Array(T * R);
  const cos = new Float32Array(T);
  const sin = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    cos[t] = Math.cos((t * 2 * Math.PI) / 180);
    sin[t] = Math.sin((t * 2 * Math.PI) / 180);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!thin[i]) continue;
      const t0 = Math.round(g.dir[i] / 2);
      for (let k = -3; k <= 3; k++) {
        const t = (((t0 + k) % T) + T) % T;
        const rho = Math.round(x * cos[t] + y * sin[t]) + diag;
        acc[t * R + rho] += 1;
      }
    }
  }
  // Sum over ±1 rho so an edge whose pixels round to two adjacent rho bins
  // (sub-pixel position, jagged rasterisation) still counts as one line.
  // Theta is already spread by the ±3-bin voting above. Value ≈ pixel count.
  const sm = new Float32Array(T * R);
  for (let t = 0; t < T; t++) {
    for (let r = 1; r < R - 1; r++) {
      sm[t * R + r] = acc[t * R + r - 1] + acc[t * R + r] + acc[t * R + r + 1];
    }
  }
  const minVotes = Math.max(10, Math.min(w, h) * 0.18);
  const peaks: HoughLine[] = [];
  for (let t = 0; t < T; t++) {
    for (let r = 1; r < R - 1; r++) {
      const v = sm[t * R + r];
      if (v < minVotes) continue;
      // Local max in a ±1 bin (±2°) × ±3 px window; ties broken by index so
      // a plateau yields exactly one peak. Narrow in theta so a page edge a few
      // degrees off a strong text line is not suppressed. Theta wraps.
      let isMax = true;
      for (let dt = -1; dt <= 1 && isMax; dt++) {
        let tt = t + dt;
        let wrap = false;
        if (tt < 0 || tt >= T) {
          tt = (tt + T) % T;
          wrap = true;
        }
        for (let dr = -3; dr <= 3; dr++) {
          if (!dt && !dr) continue;
          const rr = wrap ? R - 1 - (r + dr) : r + dr;
          if (rr < 0 || rr >= R) continue;
          const o = sm[tt * R + rr];
          if (o > v || (o === v && tt * R + rr < t * R + r)) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ theta: t * 2, rho: r - diag, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  const isDup = (p: HoughLine, list: HoughLine[]) =>
    list.some((q) => {
      let dt = Math.abs(p.theta - q.theta);
      if (dt > 90) {
        // θ and θ±180 describe the same line with negated rho
        dt = 180 - dt;
        return dt <= 4 && Math.abs(p.rho + q.rho) <= 2;
      }
      return dt <= 4 && Math.abs(p.rho - q.rho) <= 2;
    });
  // Per orientation sector: the strongest lines plus the outermost ones.
  // Text lines on a page are strong and parallel to its edges; keeping the
  // outermost lines makes sure the page border itself is a candidate.
  const perSector = Math.ceil(maxLines / 4);
  const out: HoughLine[] = [];
  for (let sector = 0; sector < 4; sector++) {
    const inSector = peaks.filter((p) => Math.round(p.theta / 45) % 4 === sector);
    const picked: HoughLine[] = [];
    const add = (p: HoughLine | undefined) => {
      if (p && !isDup(p, picked) && !isDup(p, out)) picked.push(p);
    };
    for (const p of inSector) {
      if (picked.length >= perSector) break;
      add(p);
    }
    // Signed distance from the image centre, so θ near 0/180 compare correctly.
    const cxy = (p: HoughLine) => {
      const t = (p.theta * Math.PI) / 180;
      const d = p.rho - ((w / 2) * Math.cos(t) + (h / 2) * Math.sin(t));
      return p.theta >= 135 ? -d : d;
    };
    const byOffset = [...inSector].sort((a, b) => cxy(a) - cxy(b));
    for (let k = 0; k < 6; k++) {
      add(byOffset[k]);
      add(byOffset[byOffset.length - 1 - k]);
    }
    out.push(...picked);
  }
  return out;
}

function lineIntersect(a: HoughLine, b: HoughLine): Point | null {
  const ta = (a.theta * Math.PI) / 180;
  const tb = (b.theta * Math.PI) / 180;
  const det = Math.cos(ta) * Math.sin(tb) - Math.sin(ta) * Math.cos(tb);
  if (Math.abs(det) < 1e-3) return null;
  return {
    x: (a.rho * Math.sin(tb) - b.rho * Math.sin(ta)) / det,
    y: (b.rho * Math.cos(ta) - a.rho * Math.cos(tb)) / det,
  };
}

/** Mean of two line angles (mod 180°), correct across the 0/180 wrap. */
export function meanAngle(a: number, b: number): number {
  const r = Math.PI / 90; // angles doubled so 0° ≡ 180°
  let m = Math.atan2(Math.sin(a * r) + Math.sin(b * r), Math.cos(a * r) + Math.cos(b * r)) / r;
  if (m < 0) m += 180;
  return m;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

/** Quads from pairs of roughly-parallel lines crossing another such pair. */
function houghQuads(lines: HoughLine[], w: number, h: number): Point[][] {
  const pairs: [HoughLine, HoughLine][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (angleDiff(lines[i].theta, lines[j].theta) <= 25) pairs.push([lines[i], lines[j]]);
    }
  }
  const quads: Point[][] = [];
  const m = 2;
  for (let a = 0; a < pairs.length; a++) {
    for (let b = a + 1; b < pairs.length; b++) {
      const [a1, a2] = pairs[a];
      const [b1, b2] = pairs[b];
      const cross = angleDiff(meanAngle(a1.theta, a2.theta), meanAngle(b1.theta, b2.theta));
      if (cross < 45) continue;
      const pts = [lineIntersect(a1, b1), lineIntersect(a1, b2), lineIntersect(a2, b2), lineIntersect(a2, b1)];
      if (pts.some((p) => !p || p.x < -m || p.y < -m || p.x > w - 1 + m || p.y > h - 1 + m)) continue;
      quads.push(orderQuad(pts as Point[]));
    }
  }
  return quads;
}

/** Binary dilation with a square structuring element of the given radius. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = mask[y * w + k];
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Weak edges: anything clearly above this frame's noise floor. Faint page
 * borders (white paper on a light surface) only survive at this level; line
 * fitting and orientation checks keep texture noise from passing as a page.
 */
export function weakEdgeMask(mag: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < mag.length; i++) hist[mag[i]]++;
  let target = mag.length * 0.5;
  let median = 0;
  for (let v = 0; v < 256; v++) {
    target -= hist[v];
    if (target <= 0) {
      median = v;
      break;
    }
  }
  const t = Math.max(3, median * 2);
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) out[i] = mag[i] > t ? 1 : 0;
  return out;
}

/** Edge threshold: strong gradients relative to this frame (robust to exposure). */
function edgeMask(mag: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < mag.length; i++) hist[mag[i]]++;
  // 85th percentile, but never below a small absolute floor (sensor noise).
  let target = mag.length * 0.85;
  let p85 = 255;
  for (let v = 0; v < 256; v++) {
    target -= hist[v];
    if (target <= 0) {
      p85 = v;
      break;
    }
  }
  const t = Math.max(10, p85);
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) out[i] = mag[i] > t ? 1 : 0;
  return out;
}

/**
 * Fraction of each side that lies on edge pixels (within the dilated band).
 * Returns the minimum and mean over the four sides.
 */
export function edgeSupport(quad: Point[], near: Uint8Array[], w: number, h: number): { min: number; mean: number } {
  let min = 1;
  let sum = 0;
  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(8, Math.round(len / 2));
    // Edge pixels must be oriented like this side (normal direction bin).
    let normal = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
    if (normal < 0) normal += 180;
    if (normal >= 180) normal -= 180;
    const bin = near[Math.round(normal / 45) % 4];
    let hit = 0;
    let total = 0;
    // Skip the ends: corners are often rounded or occluded.
    for (let k = 1; k < n; k++) {
      const t = 0.06 + (0.88 * k) / n;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      total++;
      // A side running along the image border has no visible edge: unsupported.
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) continue;
      if (bin[y * w + x]) hit++;
    }
    const f = total ? hit / total : 0;
    min = Math.min(min, f);
    sum += f;
  }
  return { min, mean: sum / 4 };
}

/** Push each vertex away from the centroid by `px` (regions sit just inside their edges). */
function expandQuad(q: Point[], px: number, w: number, h: number): Point[] {
  const cx = q.reduce((s, p) => s + p.x, 0) / q.length;
  const cy = q.reduce((s, p) => s + p.y, 0) / q.length;
  return q.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x: Math.min(w - 1, Math.max(0, p.x + (dx / d) * px)),
      y: Math.min(h - 1, Math.max(0, p.y + (dy / d) * px)),
    };
  });
}

/**
 * Inside-vs-outside luminance across each side. A real page differs from its
 * surroundings with the same sign on all four sides (paper brighter, or
 * darker, than the table). Lines like tile grout or marble veins have the same
 * surface on both sides and fail. Returns the weakest side's mean difference,
 * positive when the inside is brighter, negative when darker, 0 when sides disagree.
 */
export function sideContrasts(quad: Point[], lum: Uint8Array, w: number, h: number): number[] {
  const cx = quad.reduce((a, p) => a + p.x, 0) / 4;
  const cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s[s.length >> 1];
  };
  const sides: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) {
      nx = -nx;
      ny = -ny; // (nx, ny) now points inward
    }
    const n = Math.max(8, Math.round(len / 3));
    const diffs: number[] = [];
    for (let k = 1; k < n; k++) {
      const t = 0.1 + (0.8 * k) / n;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      // Median over several depths: a thin text stroke near the border or a
      // grout line just outside cannot flip the result.
      const ins: number[] = [];
      const outs: number[] = [];
      for (let o = 2; o <= 6; o++) {
        const ix = Math.round(px + nx * o);
        const iy = Math.round(py + ny * o);
        const ox = Math.round(px - nx * o);
        const oy = Math.round(py - ny * o);
        if (ix >= 0 && iy >= 0 && ix < w && iy < h) ins.push(lum[iy * w + ix]);
        if (ox >= 0 && oy >= 0 && ox < w && oy < h) outs.push(lum[oy * w + ox]);
      }
      if (ins.length < 3 || outs.length < 3) continue;
      diffs.push(median(ins) - median(outs));
    }
    if (diffs.length < 4) {
      sides.push(0);
      continue;
    }
    const m = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;
    // Most samples along this side must agree with its sign; a line with the
    // same surface on both sides (grout, vein, text) averages out to ~0.
    const agree = diffs.filter((d) => Math.sign(d) === Math.sign(m) && Math.abs(d) >= 3).length;
    sides.push(agree >= diffs.length * 0.75 ? m : 0);
  }
  return sides;
}

/**
 * Inside-vs-outside luminance across each side. Returns the weakest side's
 * difference, positive when the inside is brighter on all sides, negative
 * when darker on all sides, 0 otherwise.
 */
export function sideContrast(quad: Point[], lum: Uint8Array, w: number, h: number): { value: number; sides: number[] } {
  const sides = sideContrasts(quad, lum, w, h);
  if (sides.some((v) => v === 0)) return { value: 0, sides };
  const allPos = sides.every((d) => d > 0);
  const allNeg = sides.every((d) => d < 0);
  if (!allPos && !allNeg) return { value: 0, sides };
  const weakest = Math.min(...sides.map((d) => Math.abs(d)));
  return { value: allPos ? weakest : -weakest, sides };
}

/**
 * Edge sharpness: peak gradient across each side relative to the luminance step.
 * Paper edges are crisp (≈0.5+); shadow borders are soft (≪0.5).
 */
function edgeCrispness(quad: Point[], mag: Uint8Array, w: number, h: number, step: number): number {
  if (step <= 0) return 0;
  let sum = 0;
  let n = 0;
  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      let peak = 0;
      for (let o = -2; o <= 2; o++) {
        const x = Math.round(a.x + (b.x - a.x) * t + nx * o);
        const y = Math.round(a.y + (b.y - a.y) * t + ny * o);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        peak = Math.max(peak, mag[y * w + x]);
      }
      sum += peak;
      n++;
    }
  }
  return n ? Math.min(1, sum / n / step) : 0;
}

/**
 * Documents are not slivers: the short dimension must be a reasonable part
 * of the frame and the aspect ratio within what receipts/cards/pages have.
 * Rejects thin quads formed by e.g. the edges of sticky notes or cables.
 */
function plausibleShape(q: Point[], w: number, h: number): boolean {
  const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const s1 = (len(q[0], q[1]) + len(q[3], q[2])) / 2;
  const s2 = (len(q[1], q[2]) + len(q[0], q[3])) / 2;
  const short = Math.min(s1, s2);
  const long = Math.max(s1, s2);
  return short >= 0.15 * Math.max(w, h) && long / short <= 4.5;
}

function isConvexQuad(q: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-6) return false;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Interior angles must be reasonable for a photographed rectangle (35°–145°). */
function plausibleAngles(q: Point[]): boolean {
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4];
    const c = q[i];
    const n = q[(i + 1) % 4];
    const a1 = Math.atan2(p.y - c.y, p.x - c.x);
    const a2 = Math.atan2(n.y - c.y, n.x - c.x);
    let ang = Math.abs(a1 - a2) * (180 / Math.PI);
    if (ang > 180) ang = 360 - ang;
    if (ang < 35 || ang > 145) return false;
  }
  return true;
}

interface Line {
  // Point on line + unit direction.
  px: number;
  py: number;
  dx: number;
  dy: number;
}

/**
 * Sub-pixel side refinement: for samples along a side, move to the strongest
 * gradient along the side's normal (±search px), then fit a line (total least
 * squares). Falls back to the original side when evidence is weak.
 */
function refineSide(a: Point, b: Point, mag: Uint8Array, w: number, h: number, search: number): Line {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  const nx = -dy;
  const ny = dx;
  const pts: Point[] = [];
  const n = Math.max(8, Math.round(len / 2));
  for (let k = 1; k < n; k++) {
    const t = 0.1 + (0.8 * k) / n;
    const bx = a.x + (b.x - a.x) * t;
    const by = a.y + (b.y - a.y) * t;
    let bestV = 0;
    let bestO = 0;
    for (let o = -search; o <= search; o++) {
      const x = Math.round(bx + nx * o);
      const y = Math.round(by + ny * o);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const v = mag[y * w + x];
      if (v > bestV) {
        bestV = v;
        bestO = o;
      }
    }
    if (bestV > 0) pts.push({ x: bx + nx * bestO, y: by + ny * bestO });
  }
  if (pts.length < 4) return { px: a.x, py: a.y, dx, dy };
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) * (p.x - mx);
    syy += (p.y - my) * (p.y - my);
    sxy += (p.x - mx) * (p.y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ldx = Math.cos(theta);
  let ldy = Math.sin(theta);
  if (ldx * dx + ldy * dy < 0) {
    ldx = -ldx;
    ldy = -ldy;
  }
  // Reject fits that rotate the side too much: keep the coarse side instead.
  if (ldx * dx + ldy * dy < Math.cos((12 * Math.PI) / 180)) return { px: a.x, py: a.y, dx, dy };
  return { px: mx, py: my, dx: ldx, dy: ldy };
}

function intersect(l1: Line, l2: Line): Point | null {
  const det = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / det;
  return { x: l1.px + l1.dx * t, y: l1.py + l1.dy * t };
}

export function refineQuad(q: Point[], mag: Uint8Array, w: number, h: number, search = 4): Point[] {
  const lines = [0, 1, 2, 3].map((i) => refineSide(q[i], q[(i + 1) % 4], mag, w, h, search));
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) {
    // Corner i is the intersection of side (i-1) and side i.
    const p = intersect(lines[(i + 3) % 4], lines[i]);
    if (!p || Math.hypot(p.x - q[i].x, p.y - q[i].y) > search * 3) return q;
    out.push({ x: Math.min(w - 1, Math.max(0, p.x)), y: Math.min(h - 1, Math.max(0, p.y)) });
  }
  return out;
}

export function detectQuad(img: GrayImage, debug?: (msg: string) => void): QuadDetection {
  const { width: w, height: h, data } = img;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const brightness = data.length ? sum / data.length / 255 : 0;
  const sharpness = sharpnessOf(img);
  const empty = { quad: null, confidence: 0, brightness, sharpness };
  if (w < 16 || h < 16) return empty;

  const blurred = boxBlur(boxBlur(data, w, h, Math.max(1, Math.round(Math.min(w, h) / 120))), w, h, 1);
  // Gradients and side contrast on a lightly smoothed copy: faint page borders
  // survive and text stays thin (so medians ignore it).
  const light = boxBlur(data, w, h, 1);
  const planes = [{ data: light, gain: 1 }];
  if (img.cb && img.cr) {
    planes.push({ data: boxBlur(img.cb, w, h, 1), gain: CHROMA_GAIN }, { data: boxBlur(img.cr, w, h, 1), gain: CHROMA_GAIN });
  }
  const grad = planes.length > 1 ? sobelMulti(planes, w, h) : sobel(light, w, h);
  const mag = grad.mag;
  const edges = edgeMask(mag);
  const weak = weakEdgeMask(mag);
  const near = orientedNear(grad, thinEdges(grad, weak, w, h), w, h, 2);
  const imageArea = w * h;
  const minArea = imageArea * 0.08;

  // (a) Regions enclosed by edges: everything that is not (slightly thickened) edge.
  const closed = dilate(edges, w, h, 1);
  const free = new Uint8Array(w * h);
  for (let i = 0; i < free.length; i++) free[i] = closed[i] ? 0 : 1;
  const candidates: Component[] = components(free, w, h, minArea).slice(0, 4);

  // (b) Otsu regions of both polarities, when the frame has real contrast.
  const t = otsu(blurred);
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
  if (nLo && nHi && hi / nHi - lo / nLo >= 25) {
    for (const bright of [true, false]) {
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < blurred.length; i++) mask[i] = (blurred[i] > t) === bright ? 1 : 0;
      candidates.push(...components(mask, w, h, minArea).slice(0, 3));
    }
  }

  // Region candidates → inscribed quads.
  const quads: { quad: Point[]; quadness: number }[] = [];
  for (const comp of candidates) {
    const hull = convexHull(comp.extremes);
    const hullArea = polygonArea(hull);
    const raw = maxAreaQuad(hull);
    if (!raw || hullArea <= 0) continue;
    quads.push({ quad: expandQuad(orderQuad(raw), 1.5, w, h), quadness: polygonArea(raw) / hullArea });
  }
  // Line candidates (tolerant of gaps in faint page edges).
  const thin = thinEdges(grad, weak, w, h);
  const lines = houghLines(grad, thin, w, h, 28);
  debug?.(`lines ${lines.map((l) => `${l.theta}/${l.rho}/${l.votes}`).join(' ')}`);
  for (const q of houghQuads(lines, w, h)) quads.push({ quad: q, quadness: 1 });

  let best: { quad: Point[]; score: number } | null = null;
  for (const { quad, quadness } of quads) {
    const size = polygonArea(quad) / imageArea;
    if (size < 0.1 || size > 0.97) continue;
    if (!isConvexQuad(quad) || !plausibleAngles(quad) || quadness < 0.85) continue;
    if (!plausibleShape(quad, w, h)) continue;
    // A corner on the frame border means the page continues outside the frame.
    const mx = Math.max(2, w * 0.015);
    const my = Math.max(2, h * 0.015);
    if (quad.some((p) => p.x < mx || p.y < my || p.x > w - 1 - mx || p.y > h - 1 - my)) continue;
    const support = edgeSupport(quad, near, w, h);
    debug?.(
      `cand size=${size.toFixed(2)} quadness=${quadness.toFixed(2)} support=${support.min.toFixed(2)}/${support.mean.toFixed(2)} q=${quad.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}`,
    );
    // Every side must sit on a visible, correctly oriented edge; this is what
    // rejects shapes that run across shadows or floor, and cut-off objects.
    if (support.min < 0.55 || support.mean < 0.72) continue;
    // Per side, the plane (brightness or tint) that separates page from its
    // surroundings best. Within each plane the page must differ with one sign
    // on every side where that plane shows a difference (paper brighter than
    // the table, or bluer, all the way round); a plane whose sides disagree is
    // not evidence of a page. Different sides may rely on different planes.
    const lumSides = sideContrasts(quad, light, w, h);
    const planeSides = planes.map((p, k) => (k === 0 ? lumSides : sideContrasts(quad, p.data, w, h).map((v) => v * p.gain)));
    const consistent = planeSides.map((vals) => {
      const signs = vals.filter((v) => Math.abs(v) >= 5).map(Math.sign);
      return signs.length > 0 && signs.every((sg) => sg === signs[0]);
    });
    const sideValues = [0, 1, 2, 3].map((i) => {
      let best = 0;
      for (let k = 0; k < planes.length; k++) {
        if (consistent[k] && Math.abs(planeSides[k][i]) > Math.abs(best)) best = planeSides[k][i];
      }
      return best;
    });
    const sides = sideValues.map((v) => Math.abs(v));
    const contrast = Math.min(...sides);
    const crisp = edgeCrispness(quad, mag, w, h, contrast);
    debug?.(`  contrast=${contrast.toFixed(1)} crisp=${crisp.toFixed(2)} sides=${sideValues.map((v) => v.toFixed(0)).join(',')} lum=${lumSides.map((v) => v.toFixed(0)).join(',')}`);
    if (contrast < 10) continue;
    // Uniformly darker than the surroundings in brightness = shadow or object,
    // unless the step is strong (a dark card on a light table).
    const darkInside = lumSides.every((v) => v < 0) && sideValues.every((v, i) => v === lumSides[i]);
    if (darkInside && Math.max(...lumSides) > -80) continue;
    // Paper is usually brighter than what it lies on.
    const brighter = lumSides.filter((v) => v > 0).length;
    const polarity = darkInside ? 0.55 : brighter >= 3 ? 1 : 0.85;
    // A real page has edges all the way round and similar contrast on every
    // side; wrong quads (page + shadow, page cut at a text line) have one weak
    // side. Edge support dominates; size only breaks ties.
    const balance = Math.min(1, contrast / (0.35 * Math.max(...sides)));
    const supMean = Math.max(0, (support.mean - 0.6) / 0.4);
    const score =
      supMean * supMean *
      Math.max(0, (support.min - 0.45) / 0.55) *
      Math.pow(Math.min(1, size / 0.35), 0.25) *
      balance *
      polarity *
      Math.min(1, 0.4 + crisp);
    debug?.(`  score=${score.toFixed(3)}`);
    if (score > 0 && (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) < 1e-6 && size > polygonArea(best.quad) / imageArea))) {
      best = { quad, score };
    }
  }
  if (!best) return empty;
  const refined = refineQuad(best.quad, mag, w, h);
  const norm = orderQuad(refined.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })));
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
