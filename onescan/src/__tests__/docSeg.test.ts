import {
  DOCSEG_INPUT,
  docSegInput,
  docSegLogits,
  docSegMask,
  maskToQuad,
  parseDocSegWeights,
} from '@/core/document-engine/capture/docSeg';
import { readAppFile } from './fixtures/files';

const MODULE = 'modules/onescan-vision/';
const weightsBin = readAppFile(MODULE + 'android/src/main/assets/docseg.bin');
const parityBin = readAppFile(MODULE + 'android/src/test/resources/docseg_parity.bin');

describe('DocSeg runtime', () => {
  const weights = parseDocSegWeights(weightsBin);
  const n = DOCSEG_INPUT * DOCSEG_INPUT;
  const planes = {
    width: DOCSEG_INPUT,
    height: DOCSEG_INPUT,
    y: parityBin.slice(0, n),
    cb: parityBin.slice(n, 2 * n),
    cr: parityBin.slice(2 * n, 3 * n),
  };

  it('reproduces the PyTorch logits (parity vector)', () => {
    const expected = new Float32Array(parityBin.slice(3 * n).buffer);
    const logits = docSegLogits(weights, docSegInput(planes));
    expect(logits).toHaveLength(64 * 64);
    let maxErr = 0;
    for (let k = 0; k < logits.length; k++) maxErr = Math.max(maxErr, Math.abs(logits[k] - expected[k]));
    expect(maxErr).toBeLessThan(1e-3);
  });

  it('finds the page in the synthetic parity scene', () => {
    const r = maskToQuad(docSegMask(weights, planes));
    expect(r).not.toBeNull();
    expect(r!.confidence).toBeGreaterThan(0.85);
  });

  it('ships identical weights on Android and iOS', () => {
    const ios = readAppFile(MODULE + 'ios/docseg.bin');
    expect(ios.length).toBe(weightsBin.length);
    expect(ios.every((b, i) => b === weightsBin[i])).toBe(true);
  });

  it('rejects a corrupt weight file', () => {
    expect(() => parseDocSegWeights(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow();
  });
});

const N = 64;

/** Soft (4×4 supersampled) coverage mask of a polygon in mask-pixel coordinates. */
function render(polys: number[][][]): Float32Array {
  const m = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 4; b++) {
          const px = x - 0.375 + a * 0.25;
          const py = y - 0.375 + b * 0.25;
          if (polys.some((q) => q.every(([ax, ay], i) => {
            const [bx, by] = q[(i + 1) % q.length];
            return (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= 0;
          }))) s += 1 / 16;
        }
      }
      m[y * N + x] = s;
    }
  }
  return m;
}

const toMask = (p: { x: number; y: number }) => [p.x * N - 0.5, p.y * N - 0.5];

describe('maskToQuad', () => {
  it('recovers a rotated quad to sub-pixel accuracy', () => {
    const Q = [[10.3, 8.7], [52.1, 14.2], [47.6, 57.9], [6.2, 49.5]];
    const r = maskToQuad(render([Q]))!;
    expect(r).not.toBeNull();
    expect(r.confidence).toBeGreaterThan(0.95);
    r.quad.map(toMask).forEach(([x, y], i) => {
      expect(Math.hypot(x - Q[i][0], y - Q[i][1])).toBeLessThan(0.25);
    });
  });

  it('ignores small blobs and keeps the page', () => {
    const page = [[14, 6], [50, 6], [50, 58], [14, 58]];
    const blob = [[2, 2], [6, 2], [6, 6], [2, 6]];
    const r = maskToQuad(render([page, blob]))!;
    expect(r.quad.map(toMask)[0][0]).toBeCloseTo(14, 0);
  });

  it('returns null for empty or tiny masks', () => {
    expect(maskToQuad(new Float32Array(N * N))).toBeNull();
    expect(maskToQuad(render([[[30, 30], [34, 30], [34, 34], [30, 34]]]))).toBeNull();
  });

  it('reports no page when the page runs off the frame', () => {
    expect(maskToQuad(render([[[20, -12], [70, 2], [58, 50], [8, 40]]]))).toBeNull();
    // A corner may graze the edge.
    expect(maskToQuad(render([[[30, -0.4], [60, 20], [36, 60], [4, 30]]]))).not.toBeNull();
  });

  it('rejects regions that are not quadrilaterals', () => {
    // An L shape fits no quad well.
    const L = render([[[8, 8], [56, 8], [56, 24], [8, 24]], [[8, 8], [24, 8], [24, 56], [8, 56]]]);
    expect(maskToQuad(L)).toBeNull();
  });
});
