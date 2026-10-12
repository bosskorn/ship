/**
 * DocSeg — learned document segmentation (reference runtime + mask → quad).
 *
 * A small U-Net-style net (tools/docseg/model.py, ~280k params, ~40M MACs) maps the
 * camera's Y/Cb/Cr planes, resized to 128×128, to a 64×64 "page" probability map.
 * The native module runs the same net (Kotlin / Swift) on preview frames and stills
 * and hands the mask to JS; this file is the bit-for-bit reference used by tests and
 * benchmarks, plus the geometry that turns a mask into the document quadrilateral.
 *
 * Weight file layout: see tools/docseg/export.py.
 */
import type { Point, Quad } from '../model';
import { convexHull, maxAreaQuad, orderQuad, polygonArea } from './quadDetector';

export const DOCSEG_INPUT = 128;
export const DOCSEG_MASK = 64;

export interface DocSegWeights {
  /** Blocks per stage: encoder e1..e4, decoder d3..d1. */
  blocks: number[];
  arrays: Float32Array[];
}

export function parseDocSegWeights(buf: Uint8Array): DocSegWeights {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'DSG2' || buf.length < 36) throw new Error('docseg: bad weight file');
  const blocks = Array.from({ length: 7 }, (_, i) => view.getUint32(4 + i * 4, true));
  const count = view.getUint32(32, true);
  // stem + 2 convs per block + context + decoder 1×1s + head, each weight + bias.
  const convs = 1 + 2 * blocks.reduce((a, b) => a + b, 0) + 3;
  if (blocks.some((b, i) => b < (i < 4 ? 1 : 0) || b > 16) || count !== convs * 2 + 2 + 2) {
    throw new Error('docseg: unexpected layer count');
  }
  const arrays: Float32Array[] = [];
  let off = 36;
  for (let i = 0; i < count; i++) {
    if (off + 4 > buf.length) throw new Error('docseg: truncated weight file');
    const n = view.getUint32(off, true);
    off += 4;
    if (off + n * 4 > buf.length) throw new Error('docseg: truncated weight file');
    const a = new Float32Array(n);
    for (let k = 0; k < n; k++) a[k] = view.getFloat32(off + k * 4, true);
    off += n * 4;
    arrays.push(a);
  }
  return { blocks, arrays };
}

interface T {
  c: number;
  h: number;
  w: number;
  d: Float32Array;
}

function conv3x3(x: T, wt: Float32Array, b: Float32Array, cout: number, stride: number): T {
  const ho = Math.floor((x.h - 1) / stride) + 1;
  const wo = Math.floor((x.w - 1) / stride) + 1;
  const out = new Float32Array(cout * ho * wo);
  for (let co = 0; co < cout; co++) {
    for (let oy = 0; oy < ho; oy++) {
      for (let ox = 0; ox < wo; ox++) {
        let s = b[co];
        for (let ci = 0; ci < x.c; ci++) {
          const base = ci * x.h * x.w;
          const wb = (co * x.c + ci) * 9;
          for (let ky = 0; ky < 3; ky++) {
            const iy = oy * stride + ky - 1;
            if (iy < 0 || iy >= x.h) continue;
            for (let kx = 0; kx < 3; kx++) {
              const ix = ox * stride + kx - 1;
              if (ix < 0 || ix >= x.w) continue;
              s += wt[wb + ky * 3 + kx] * x.d[base + iy * x.w + ix];
            }
          }
        }
        out[(co * ho + oy) * wo + ox] = s > 0 ? s : 0;
      }
    }
  }
  return { c: cout, h: ho, w: wo, d: out };
}

function depthwise(x: T, wt: Float32Array, b: Float32Array, stride: number): T {
  const ho = Math.floor((x.h - 1) / stride) + 1;
  const wo = Math.floor((x.w - 1) / stride) + 1;
  const out = new Float32Array(x.c * ho * wo);
  for (let c = 0; c < x.c; c++) {
    const base = c * x.h * x.w;
    const w0 = c * 9;
    for (let oy = 0; oy < ho; oy++) {
      for (let ox = 0; ox < wo; ox++) {
        let s = b[c];
        for (let ky = 0; ky < 3; ky++) {
          const iy = oy * stride + ky - 1;
          if (iy < 0 || iy >= x.h) continue;
          for (let kx = 0; kx < 3; kx++) {
            const ix = ox * stride + kx - 1;
            if (ix < 0 || ix >= x.w) continue;
            s += wt[w0 + ky * 3 + kx] * x.d[base + iy * x.w + ix];
          }
        }
        out[(c * ho + oy) * wo + ox] = s > 0 ? s : 0;
      }
    }
  }
  return { c: x.c, h: ho, w: wo, d: out };
}

function pointwise(x: T, wt: Float32Array, b: Float32Array, cout: number, relu: boolean): T {
  const n = x.h * x.w;
  const out = new Float32Array(cout * n);
  for (let co = 0; co < cout; co++) {
    const o = co * n;
    out.fill(b[co], o, o + n);
    for (let ci = 0; ci < x.c; ci++) {
      const k = wt[co * x.c + ci];
      if (k === 0) continue;
      const src = ci * n;
      for (let p = 0; p < n; p++) out[o + p] += k * x.d[src + p];
    }
    if (relu) for (let p = o; p < o + n; p++) if (out[p] < 0) out[p] = 0;
  }
  return { c: cout, h: x.h, w: x.w, d: out };
}

/** Nearest ×2 upsample of `a`, concatenated with skip `s` along channels. */
function upCat(a: T, s: T): T {
  const h = a.h * 2;
  const w = a.w * 2;
  const out = new Float32Array((a.c + s.c) * h * w);
  for (let c = 0; c < a.c; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[(c * h + y) * w + x] = a.d[(c * a.h + (y >> 1)) * a.w + (x >> 1)];
    }
  }
  out.set(s.d, a.c * h * w);
  return { c: a.c + s.c, h, w, d: out };
}

/** Bilinear resize (align_corners=false) of one uint8 plane to size×size, scaled to [-1,1]. */
function resizePlane(src: Uint8Array, w: number, h: number, size: number, out: Float32Array, off: number): void {
  const sx = w / size;
  const sy = h / size;
  for (let y = 0; y < size; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx;
      const bot = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
      out[off + y * size + x] = (Math.round(top * (1 - ty) + bot * ty) - 128) / 128;
    }
  }
}

export interface Planes {
  width: number;
  height: number;
  y: Uint8Array;
  cb?: Uint8Array;
  cr?: Uint8Array;
}

/** Builds the 3×128×128 network input from frame planes (missing chroma = neutral). */
export function docSegInput(p: Planes): Float32Array {
  const s = DOCSEG_INPUT;
  const out = new Float32Array(3 * s * s);
  resizePlane(p.y, p.width, p.height, s, out, 0);
  if (p.cb && p.cr) {
    resizePlane(p.cb, p.width, p.height, s, out, s * s);
    resizePlane(p.cr, p.width, p.height, s, out, 2 * s * s);
  }
  return out;
}

/** Runs the net on a prepared input; returns 64×64 logits. */
export function docSegLogits(weights: DocSegWeights, input: Float32Array): Float32Array {
  const w = weights.arrays;
  const [n1, n2, n3, n4, m3, m2, m1] = weights.blocks;
  let i = 0;
  const next = () => [w[i++], w[i++]] as const;
  // Channel widths come from the weight file (bias length = output channels).
  const sep = (x: T, stride: number): T => {
    const [dw, db] = next();
    const [pw, pb] = next();
    return pointwise(depthwise(x, dw, db, stride), pw, pb, pb.length, true);
  };
  const stage = (x: T, n: number, stride: number): T => {
    let y = sep(x, stride);
    for (let k = 1; k < n; k++) y = sep(y, 1);
    return y;
  };
  const s = DOCSEG_INPUT;
  let x: T = { c: 3, h: s, w: s, d: input };
  const [sw, sb] = next();
  x = conv3x3(x, sw, sb, sb.length, 2);
  const s1 = stage(x, n1, 1);
  const s2 = stage(s1, n2, 2);
  const s3 = stage(s2, n3, 2);
  let s4 = stage(s3, n4, 2);
  // Global context: mean over space → linear → per-channel bias, then ReLU.
  const [cw, cb] = next();
  const hw4 = s4.h * s4.w;
  const c4 = s4.c;
  const mean = new Float32Array(c4);
  for (let c = 0; c < c4; c++) {
    let a = 0;
    for (let p = 0; p < hw4; p++) a += s4.d[c * hw4 + p];
    mean[c] = a / hw4;
  }
  const d4 = new Float32Array(s4.d.length);
  for (let c = 0; c < c4; c++) {
    let v = cb[c];
    for (let k = 0; k < c4; k++) v += cw[c * c4 + k] * mean[k];
    for (let p = 0; p < hw4; p++) {
      const t = s4.d[c * hw4 + p] + v;
      d4[c * hw4 + p] = t > 0 ? t : 0;
    }
  }
  s4 = { ...s4, d: d4 };
  const dec = (a: T, skip: T, n: number): T => {
    const [pw, pb] = next();
    let y = pointwise(upCat(a, skip), pw, pb, pb.length, true);
    for (let k = 0; k < n; k++) y = sep(y, 1);
    return y;
  };
  let y = dec(s4, s3, m3);
  y = dec(y, s2, m2);
  y = dec(y, s1, m1);
  const [hw, hb] = next();
  return pointwise(y, hw, hb, 1, false).d;
}

/** 64×64 page probabilities for a frame. */
export function docSegMask(weights: DocSegWeights, p: Planes): Float32Array {
  const l = docSegLogits(weights, docSegInput(p));
  const out = new Float32Array(l.length);
  for (let k = 0; k < l.length; k++) out[k] = 1 / (1 + Math.exp(-l[k]));
  return out;
}

export interface MaskQuad {
  /** Normalised (0..1) TL, TR, BR, BL in frame coordinates. */
  quad: Quad;
  /** IoU between the fitted quad and the segmented region (0..1). */
  confidence: number;
}

/** Smallest region (fraction of the frame) reported as a document. */
const MIN_AREA = 0.02;
/** Below this agreement between quad and mask the region is not a page. */
const MIN_IOU = 0.82;
/** A region running along a frame edge for more than this share of it is cut off. */
const MAX_EDGE_RUN = 0.1;

function sample(m: Float32Array, n: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > n - 1 || y > n - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  return (
    (m[y0 * n + x0] * (1 - tx) + m[y0 * n + x1] * tx) * (1 - ty) + (m[y1 * n + x0] * (1 - tx) + m[y1 * n + x1] * tx) * ty
  );
}

interface FitLine {
  px: number;
  py: number;
  dx: number;
  dy: number;
}

function fitLine(pts: Point[]): FitLine | null {
  if (pts.length < 4) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(ang), dy: Math.sin(ang) };
}

function meet(a: FitLine, b: FitLine): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
  return { x: a.px + a.dx * t, y: a.py + a.dy * t };
}

/** Sub-pixel 0.5-crossings along one side, robustly fitted to a line. */
function refineSide(m: Float32Array, n: number, a: Point, b: Point, orient: number): FitLine | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 3) return null;
  const tx = (b.x - a.x) / len;
  const ty = (b.y - a.y) / len;
  // Outward normal (polygon orientation decides the sign).
  const nx = -ty * orient;
  const ny = tx * orient;
  const pts: Point[] = [];
  const steps = Math.max(6, Math.round(len / 1.5));
  for (let k = 1; k < steps; k++) {
    const t = 0.08 + (0.84 * k) / steps;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    let prev = sample(m, n, cx - nx * 3, cy - ny * 3);
    for (let s = -2.75; s <= 3; s += 0.25) {
      const v = sample(m, n, cx + nx * s, cy + ny * s);
      if (prev >= 0.5 && v < 0.5) {
        const f = (prev - 0.5) / (prev - v);
        const off = s - 0.25 + 0.25 * f;
        pts.push({ x: cx + nx * off, y: cy + ny * off });
        break;
      }
      prev = v;
    }
  }
  let line = fitLine(pts);
  if (!line) return null;
  // One round of outlier rejection (bites, fingers, glare holes).
  const dist = (p: Point, l: FitLine) => Math.abs((p.x - l.px) * l.dy - (p.y - l.py) * l.dx);
  const kept = pts.filter((p) => dist(p, line!) < 0.75);
  if (kept.length >= Math.max(4, pts.length * 0.5)) line = fitLine(kept) ?? line;
  return line;
}

/**
 * Turns a page-probability map (n×n, covering the whole frame) into a quadrilateral:
 * largest region → convex hull → max-area quad → per-side sub-pixel line fits.
 */
export function maskToQuad(m: Float32Array, n = DOCSEG_MASK): MaskQuad | null {
  const N = n * n;
  const lab = new Int32Array(N).fill(-1);
  let best = -1;
  let bestSize = 0;
  const stack: number[] = [];
  let id = 0;
  for (let s = 0; s < N; s++) {
    if (m[s] < 0.5 || lab[s] >= 0) continue;
    let size = 0;
    lab[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % n;
      const y = (p - x) / n;
      if (x > 0 && m[p - 1] >= 0.5 && lab[p - 1] < 0) (lab[p - 1] = id), stack.push(p - 1);
      if (x < n - 1 && m[p + 1] >= 0.5 && lab[p + 1] < 0) (lab[p + 1] = id), stack.push(p + 1);
      if (y > 0 && m[p - n] >= 0.5 && lab[p - n] < 0) (lab[p - n] = id), stack.push(p - n);
      if (y < n - 1 && m[p + n] >= 0.5 && lab[p + n] < 0) (lab[p + n] = id), stack.push(p + n);
    }
    if (size > bestSize) (bestSize = size), (best = id);
    id++;
  }
  if (best < 0 || bestSize < MIN_AREA * N) return null;

  // A page running off the frame can't be scanned whole: report none so the capture
  // hint asks the user to move back (same rule as the edge detector).
  const edge = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    if (lab[k] === best) edge[0]++;
    if (lab[(n - 1) * n + k] === best) edge[1]++;
    if (lab[k * n] === best) edge[2]++;
    if (lab[k * n + n - 1] === best) edge[3]++;
  }
  if (edge.some((c) => c > MAX_EDGE_RUN * n)) return null;

  // Outline: leftmost/rightmost region pixel of every row (enough for the convex hull).
  const pts: Point[] = [];
  for (let y = 0; y < n; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < n; x++) {
      if (lab[y * n + x] === best) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    if (lo >= 0) pts.push({ x: lo, y }, { x: hi, y });
  }
  const hull = convexHull(pts);
  const coarse = maxAreaQuad(hull);
  if (!coarse) return null;
  const q = orderQuad(coarse);

  // Clockwise in y-down coordinates (positive signed area): (-ty, tx) points inside.
  const signed = q.reduce((acc, p, i) => acc + (p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y), 0);
  const orient = signed > 0 ? -1 : 1;
  const lines = [0, 1, 2, 3].map((i) => refineSide(m, n, q[i], q[(i + 1) % 4], orient));
  let corners: Point[] = q;
  if (lines.every(Boolean)) {
    const fitted: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const p = meet(lines[(i + 3) % 4]!, lines[i]!);
      if (!p || Math.hypot(p.x - q[i].x, p.y - q[i].y) > 4) break;
      fitted.push(p);
    }
    if (fitted.length === 4) corners = fitted;
  }

  // Agreement between the quad and the region.
  let inter = 0;
  let quadPx = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inQ = inside(corners, x, y);
      if (inQ) quadPx++;
      if (inQ && lab[y * n + x] === best) inter++;
    }
  }
  const iou = inter / Math.max(1, quadPx + bestSize - inter);
  if (iou < MIN_IOU || polygonArea(corners) < MIN_AREA * N) return null;

  // Mask pixel centres sit at (k + 0.5) / n of the frame.
  const norm = corners.map((p) => ({
    x: Math.min(1, Math.max(0, (p.x + 0.5) / n)),
    y: Math.min(1, Math.max(0, (p.y + 0.5) / n)),
  }));
  return { quad: orderQuad(norm), confidence: iou };
}

function inside(q: Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
