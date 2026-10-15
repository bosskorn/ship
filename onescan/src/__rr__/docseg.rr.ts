/**
 * Receipt Restore R2 — the app's own receipt boundary (CaptureEngine.detect, prior 'receipt':
 * presence gate → DocSeg mask → zoomed second pass → crop candidates + ranker → text-safe
 * grow → confidence gate) on benchmark captures. Only the native image calls are replaced:
 * decode/resize mirror ImageIO.loadUpright (power-of-two sample from the original size, then
 * bilinear scale), planes use ImageIO.ycbcr's integer BT.601, and the mask comes from the
 * reference DocSeg runtime with the shipped weights (parity-tested against Kotlin).
 *
 *   RR_HALF=<dir of half-res PNGs + meta.json> RR_OUT=<out.jsonl> npx jest -c src/__rr__/jest.config.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
declare const require: (id: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
declare const process: { env: Record<string, string | undefined> };

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const HALF = process.env.RR_HALF!;
const OUT = process.env.RR_OUT!;

interface Img { w: number; h: number; rgb: Uint8Array }
const cache = new Map<string, Img>();
function mockHalf(uri: string): Img {
  let im = cache.get(uri);
  if (!im) {
    const png = PNG.sync.read(fs.readFileSync(path.join(HALF, uri + '.png')));
    const rgb = new Uint8Array(png.width * png.height * 3);
    for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
      rgb[j] = png.data[i];
      rgb[j + 1] = png.data[i + 1];
      rgb[j + 2] = png.data[i + 2];
    }
    im = { w: png.width, h: png.height, rgb };
    cache.clear();
    cache.set(uri, im);
  }
  return im;
}

/** Area average (down) / bilinear (up) of a region of the half-res image to (tw, th). */
function mockResample(src: Img, x0: number, y0: number, w: number, h: number, tw: number, th: number): Uint8Array {
  const out = new Uint8Array(tw * th * 3);
  const sx = w / tw;
  const sy = h / th;
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const fx0 = x0 + tx * sx;
      const fy0 = y0 + ty * sy;
      if (sx > 1 || sy > 1) {
        const xa = Math.floor(fx0), xb = Math.max(xa + 1, Math.floor(fx0 + sx));
        const ya = Math.floor(fy0), yb = Math.max(ya + 1, Math.floor(fy0 + sy));
        const acc = [0, 0, 0];
        let n = 0;
        for (let y = ya; y < yb && y < src.h; y++) {
          for (let x = xa; x < xb && x < src.w; x++) {
            const k = (y * src.w + x) * 3;
            acc[0] += src.rgb[k];
            acc[1] += src.rgb[k + 1];
            acc[2] += src.rgb[k + 2];
            n++;
          }
        }
        for (let c = 0; c < 3; c++) out[(ty * tw + tx) * 3 + c] = n ? Math.round(acc[c] / n) : 0;
      } else {
        const fx = Math.min(src.w - 1.001, Math.max(0, fx0 + sx / 2 - 0.5));
        const fy = Math.min(src.h - 1.001, Math.max(0, fy0 + sy / 2 - 0.5));
        const xi = Math.floor(fx), yi = Math.floor(fy), ax = fx - xi, ay = fy - yi;
        for (let c = 0; c < 3; c++) {
          const p = (yy: number, xx: number) => src.rgb[(yy * src.w + xx) * 3 + c];
          out[(ty * tw + tx) * 3 + c] = Math.round(
            p(yi, xi) * (1 - ax) * (1 - ay) + p(yi, xi + 1) * ax * (1 - ay) + p(yi + 1, xi) * (1 - ax) * ay + p(yi + 1, xi + 1) * ax * ay,
          );
        }
      }
    }
  }
  return out;
}

/** ImageIO.loadUpright: decoded size after inSampleSize, then scaled so the long edge = maxEdge. */
function mockUpright(ow: number, oh: number, maxEdge: number) {
  let sample = 1;
  while (Math.max(ow, oh) / (sample * 2) >= maxEdge) sample *= 2;
  let w = Math.ceil(ow / sample), h = Math.ceil(oh / sample);
  const long = Math.max(w, h);
  if (long > maxEdge) {
    const s = maxEdge / long;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { w, h };
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
declare const Buffer: { from(u: Uint8Array): { toString(enc: string): string } };

let mockWeights: unknown = null;
function mockPlanes(rgb: Uint8Array, w: number, h: number, withMask: boolean) {
  const n = w * h;
  const y = new Uint8Array(n), cb = new Uint8Array(n), cr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    y[i] = (r * 77 + g * 150 + b * 29) >> 8;
    cb[i] = Math.max(0, Math.min(255, 128 + ((-43 * r - 85 * g + 128 * b) >> 8)));
    cr[i] = Math.max(0, Math.min(255, 128 + ((128 * r - 107 * g - 21 * b) >> 8)));
  }
  const out: Record<string, unknown> = { width: w, height: h, data: b64(y), cb: b64(cb), cr: b64(cr) };
  if (withMask) {
    const { docSegMask } = require('@/core/document-engine/capture/docSeg');
    const m: Float32Array = docSegMask(mockWeights, { width: w, height: h, y, cb, cr });
    const u = new Uint8Array(m.length);
    for (let i = 0; i < m.length; i++) u[i] = Math.round(Math.max(0, Math.min(1, m[i])) * 255);
    out.mask = b64(u);
  }
  return out;
}

let mockMeta: Record<string, { w: number; h: number }> = {};
jest.mock('@/native/OneScanVision', () => ({
  OneScanVision: {
    grayscaleAsync: async (uri: string, maxEdge: number, withMask?: boolean) => {
      const m = mockMeta[uri];
      const im = mockHalf(uri);
      const { w, h } = mockUpright(m.w, m.h, maxEdge);
      return mockPlanes(mockResample(im, 0, 0, im.w, im.h, w, h), w, h, !!withMask);
    },
    grayscaleRegionAsync: async (uri: string, region: { x: number; y: number; width: number; height: number }, maxEdge: number, withMask?: boolean) => {
      const m = mockMeta[uri];
      const im = mockHalf(uri);
      const frac = Math.min(1, Math.max(0.05, Math.max(region.width, region.height)));
      const full = mockUpright(m.w, m.h, Math.min(2048, Math.floor(maxEdge / frac)));
      const x0 = Math.min(full.w - 2, Math.max(0, Math.floor(region.x * full.w)));
      const y0 = Math.min(full.h - 2, Math.max(0, Math.floor(region.y * full.h)));
      const w = Math.min(full.w - x0, Math.max(2, Math.floor(region.width * full.w)));
      const h = Math.min(full.h - y0, Math.max(2, Math.floor(region.height * full.h)));
      const s = Math.min(1, maxEdge / Math.max(w, h));
      const tw = Math.max(2, Math.floor(w * s)), th = Math.max(2, Math.floor(h * s));
      const k = im.w / full.w; // half-res pixels per decoded pixel
      return mockPlanes(mockResample(im, x0 * k, y0 * k, w * k, h * k, tw, th), tw, th, !!withMask);
    },
  },
}));

test('app receipt boundary on the benchmark', async () => {
  const { parseDocSegWeights } = require('@/core/document-engine/capture/docSeg');
  mockWeights = parseDocSegWeights(new Uint8Array(fs.readFileSync(path.join(__dirname, '../../modules/onescan-vision/android/src/main/assets/docseg.bin'))));
  mockMeta = JSON.parse(fs.readFileSync(path.join(HALF, 'meta.json')));
  const { CaptureEngine } = require('@/core/document-engine/capture/CaptureEngine');
  const fd = fs.openSync(OUT, 'w');
  for (const uri of Object.keys(mockMeta)) {
    const t = Date.now();
    const r = await CaptureEngine.detect(uri, 'receipt');
    const m = mockMeta[uri];
    fs.writeSync(fd, JSON.stringify({
      case: uri, detected: r.detected, decision: r.decision, confidence: r.confidence, presence: r.presence ?? null,
      quad: r.quad.map((p: { x: number; y: number }) => [p.x * m.w, p.y * m.h]),
      suggestion: r.suggestion ? r.suggestion.map((p: { x: number; y: number }) => [p.x * m.w, p.y * m.h]) : null, ms: Date.now() - t,
    }) + '\n');
  }
  fs.closeSync(fd);
});
