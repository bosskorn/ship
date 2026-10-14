import type { GrayImage } from '../quadDetector';

/**
 * Document presence gate: "is there a document in this photo?", answered before any crop
 * is proposed. A tiny CNN (tools/presence/presence.py) on 96×96 Y/Cb/Cr, run here in plain
 * TS — same math as the PyTorch model (BatchNorm folded into the convolutions).
 */
export const PRESENCE_IN = 96;

export interface PresenceWeights {
  convs: { w: Float32Array; b: Float32Array; cin: number; cout: number; stride: number }[];
  headW: Float32Array;
  headB: number;
}

export type Presence = 'present' | 'uncertain' | 'none';

/** Parse a PRS1 weight file (see presence.py `export`). */
export function parsePresenceWeights(bytes: Uint8Array): PresenceWeights {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'PRS1') throw new Error('Not a presence weight file');
  const count = view.getUint32(4, true);
  let off = 8;
  const arrays: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const n = view.getUint32(off, true);
    off += 4;
    const a = new Float32Array(n);
    for (let k = 0; k < n; k++) a[k] = view.getFloat32(off + 4 * k, true);
    off += 4 * n;
    arrays.push(a);
  }
  const convs: PresenceWeights['convs'] = [];
  let cin = 3;
  for (let i = 0; i + 1 < arrays.length - 2; i += 2) {
    const b = arrays[i + 1];
    const cout = b.length;
    // Each stage: a stride-2 conv, then a stride-1 conv at the same width.
    const stride = convs.length % 2 === 0 ? 2 : 1;
    convs.push({ w: arrays[i], b, cin, cout, stride });
    cin = cout;
  }
  return { convs, headW: arrays[arrays.length - 2], headB: arrays[arrays.length - 1][0] };
}

/** 3×3 convolution, padding 1, + ReLU. Input/output are [c][h][w]. */
function conv3(x: Float32Array, h: number, w: number, c: PresenceWeights['convs'][number]) {
  const s = c.stride;
  const oh = Math.ceil(h / s);
  const ow = Math.ceil(w / s);
  const out = new Float32Array(c.cout * oh * ow);
  for (let o = 0; o < c.cout; o++) {
    const bias = c.b[o];
    for (let y = 0; y < oh; y++) {
      for (let xo = 0; xo < ow; xo++) {
        let acc = bias;
        for (let i = 0; i < c.cin; i++) {
          const wb = (o * c.cin + i) * 9;
          const xb = i * h * w;
          for (let ky = 0; ky < 3; ky++) {
            const iy = y * s + ky - 1;
            if (iy < 0 || iy >= h) continue;
            for (let kx = 0; kx < 3; kx++) {
              const ix = xo * s + kx - 1;
              if (ix < 0 || ix >= w) continue;
              acc += c.w[wb + ky * 3 + kx] * x[xb + iy * w + ix];
            }
          }
        }
        out[(o * oh + y) * ow + xo] = acc > 0 ? acc : 0;
      }
    }
  }
  return { out, h: oh, w: ow };
}

/** Adaptive average pooling of a uint8 plane to n×n (PyTorch `adaptive_avg_pool2d` windows). */
export function poolPlane(src: Uint8Array, w: number, h: number, n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const y0 = Math.floor((y * h) / n);
    const y1 = Math.ceil(((y + 1) * h) / n);
    for (let x = 0; x < n; x++) {
      const x0 = Math.floor((x * w) / n);
      const x1 = Math.ceil(((x + 1) * w) / n);
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += src[yy * w + xx];
      out[y * n + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Presence logit for planes already at PRESENCE_IN × PRESENCE_IN (values 0..255). */
export function presenceLogit(planes: [Float32Array, Float32Array, Float32Array], wts: PresenceWeights): number {
  const n = PRESENCE_IN;
  let x = new Float32Array(3 * n * n);
  for (let c = 0; c < 3; c++) for (let i = 0; i < n * n; i++) x[c * n * n + i] = (planes[c][i] - 128) / 128;
  let h = n;
  let w = n;
  for (const c of wts.convs) {
    const r = conv3(x, h, w, c);
    x = r.out;
    h = r.h;
    w = r.w;
  }
  const C = wts.convs[wts.convs.length - 1].cout;
  let z = wts.headB;
  for (let c = 0; c < C; c++) {
    let sum = 0;
    let max = -Infinity;
    for (let i = 0; i < h * w; i++) {
      const v = x[c * h * w + i];
      sum += v;
      if (v > max) max = v;
    }
    z += wts.headW[c] * (sum / (h * w)) + wts.headW[C + c] * max;
  }
  return z;
}

/** Probability that the analysis image shows a document. */
export function presenceProbability(img: GrayImage, wts: PresenceWeights): number {
  const n = PRESENCE_IN;
  const y = poolPlane(img.data, img.width, img.height, n);
  const cb = img.cb ? poolPlane(img.cb, img.width, img.height, n) : new Float32Array(n * n).fill(128);
  const cr = img.cr ? poolPlane(img.cr, img.width, img.height, n) : new Float32Array(n * n).fill(128);
  return 1 / (1 + Math.exp(-presenceLogit([y, cb, cr], wts)));
}

/**
 * Three-way gate. `none` stops before segmentation (no crop is proposed); `uncertain`
 * allows a suggestion but never an automatic crop. Thresholds are chosen on held-out real
 * photos without documents (false positives < 0.5%) — see tools/presence.
 */
export function presenceGate(p: number, t: { present: number; none: number }): Presence {
  if (p >= t.present) return 'present';
  if (p <= t.none) return 'none';
  return 'uncertain';
}
