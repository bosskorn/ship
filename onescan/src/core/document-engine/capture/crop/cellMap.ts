import type { GrayImage } from '../quadDetector';

/**
 * Coarse per-cell description of an analysis image (≈ 8 px cells at 384–512 px): where
 * the text is, how textured the rest is, and its colour. Crop candidates are scored by
 * what they enclose (crop/documentCrop.ts).
 *
 * Text = dense, high-contrast dark detail with mixed stroke directions. Marble veins,
 * wood grain and tile grout are dark detail too, but sparse or one-directional, so the
 * stroke-direction test (structure-tensor coherence) and the neighbour rule keep them out.
 */
export interface CellMap {
  cols: number;
  rows: number;
  cell: number;
  /** 1 = text-like cell. */
  text: Uint8Array;
  /** Gradient energy normalised by local brightness (texture), non-negative. */
  texture: Float32Array;
  /** Mean Y, Cb, Cr per cell. */
  y: Float32Array;
  cb: Float32Array;
  cr: Float32Array;
  textCount: number;
  /** The dominant text block: text cells connected (within 2 cells) to the largest cluster. */
  mainText: Uint8Array;
  mainCount: number;
}

/** Max filter (dilation) with a (2r+1)² square, separable. */
function maxFilter(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

export function cellMap(img: GrayImage, cell = 8): CellMap {
  const { width: w, height: h, data } = img;
  const cols = Math.max(1, Math.floor(w / cell));
  const rows = Math.max(1, Math.floor(h / cell));
  const n = cols * rows;
  const dil = maxFilter(data, w, h, 2);
  const strong = new Uint16Array(n);
  const maxBh = new Uint8Array(n);
  const jxx = new Float32Array(n);
  const jyy = new Float32Array(n);
  const jxy = new Float32Array(n);
  const ys = new Float32Array(n);
  const cbs = new Float32Array(n);
  const crs = new Float32Array(n);
  const area = cell * cell;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      let sy = 0;
      let scb = 0;
      let scr = 0;
      let localMax = 0;
      for (let y = cy * cell; y < (cy + 1) * cell; y++) {
        for (let x = cx * cell; x < (cx + 1) * cell; x++) {
          const i = y * w + x;
          sy += data[i];
          if (img.cb && img.cr) {
            scb += img.cb[i];
            scr += img.cr[i];
          }
          if (dil[i] > localMax) localMax = dil[i];
        }
      }
      ys[c] = sy / area;
      cbs[c] = img.cb ? scb / area : 128;
      crs[c] = img.cr ? scr / area : 128;
      // Dark detail: darker than its 5×5 neighbourhood maximum by a contrast relative to it.
      const thr = Math.max(18, localMax * 0.18);
      let cnt = 0;
      let mb = 0;
      for (let y = cy * cell; y < (cy + 1) * cell; y++) {
        for (let x = cx * cell; x < (cx + 1) * cell; x++) {
          const i = y * w + x;
          const bh = dil[i] - data[i];
          if (bh > thr) cnt++;
          if (bh > mb) mb = bh;
          if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
            const gx = data[i + 1] - data[i - 1];
            const gy = data[i + w] - data[i - w];
            jxx[c] += gx * gx;
            jyy[c] += gy * gy;
            jxy[c] += gx * gy;
          }
        }
      }
      strong[c] = cnt;
      maxBh[c] = mb;
    }
  }
  const raw = new Uint8Array(n);
  const texture = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    const tr = jxx[c] + jyy[c];
    const coherence = tr > 0 ? Math.sqrt((jxx[c] - jyy[c]) ** 2 + 4 * jxy[c] ** 2) / tr : 1;
    const density = strong[c] / area;
    const ref = ys[c] + 24;
    texture[c] = Math.sqrt(tr / area) / ref;
    raw[c] = density >= 0.05 && density <= 0.6 && maxBh[c] >= 40 && coherence < 0.8 ? 1 : 0;
  }
  // Text comes in lines and blocks: keep cells with at least two text neighbours.
  const text = new Uint8Array(n);
  let textCount = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      if (!raw[c]) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < cols && y < rows && raw[y * cols + x]) nb++;
        }
      }
      if (nb >= 2) {
        text[c] = 1;
        textCount++;
      }
    }
  }
  // Dominant text block: clusters of text cells linked within 2 cells; the largest wins.
  // Stray "text" (vein crossings, tile corners) far from the page stays out of it.
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (!text[s0] || label[s0] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[s0] = id;
    stack.push(s0);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const j = y * cols + x;
          if (text[j] && label[j] < 0) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(size);
  }
  let main = -1;
  for (let i = 0; i < sizes.length; i++) if (main < 0 || sizes[i] > sizes[main]) main = i;
  const mainText = new Uint8Array(n);
  let mainCount = 0;
  if (main >= 0) {
    for (let i = 0; i < n; i++) {
      if (label[i] === main) {
        mainText[i] = 1;
        mainCount++;
      }
    }
  }
  return { cols, rows, cell, text, texture, y: ys, cb: cbs, cr: crs, textCount, mainText, mainCount };
}
