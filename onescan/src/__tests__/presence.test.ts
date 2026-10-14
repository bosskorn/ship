import { parsePresenceWeights, poolPlane, presenceGate, presenceLogit, PRESENCE_IN } from '@/core/document-engine/capture/crop/presence';
import { PRESENCE_THRESHOLDS, PRESENCE_WEIGHTS_B64 } from '@/core/document-engine/capture/crop/presenceWeights';
import { base64ToUint8 } from '@/core/document-engine/capture/quadDetector';
import { readAppFile } from './fixtures/files';

describe('document presence gate', () => {
  (PRESENCE_WEIGHTS_B64 ? it : it.skip)('reproduces the PyTorch model (parity vector)', () => {
    const w = parsePresenceWeights(base64ToUint8(PRESENCE_WEIGHTS_B64));
    const parity = readAppFile('tools/presence/presence_parity.bin');
    const n = PRESENCE_IN * PRESENCE_IN;
    const plane = (k: number) => Float32Array.from(parity.slice(k * n, (k + 1) * n));
    const expected = new DataView(parity.buffer, parity.byteOffset + 3 * n, 4).getFloat32(0, true);
    // Inputs are the uint8-rounded planes; allow for that rounding.
    expect(presenceLogit([plane(0), plane(1), plane(2)], w)).toBeCloseTo(expected, 1);
  });

  it('pools like adaptive_avg_pool2d', () => {
    const src = Uint8Array.from({ length: 6 * 4 }, (_, i) => i);
    const p = poolPlane(src, 6, 4, 2);
    // Windows: x 0..2 / 3..5, y 0..1 / 2..3.
    expect(Array.from(p)).toEqual([(0 + 1 + 2 + 6 + 7 + 8) / 6, (3 + 4 + 5 + 9 + 10 + 11) / 6, (12 + 13 + 14 + 18 + 19 + 20) / 6, (15 + 16 + 17 + 21 + 22 + 23) / 6]);
  });

  it('is three-way and never treats uncertainty as presence', () => {
    const t = { present: 0.9, none: 0.2 };
    expect(presenceGate(0.95, t)).toBe('present');
    expect(presenceGate(0.5, t)).toBe('uncertain');
    expect(presenceGate(0.1, t)).toBe('none');
    expect(PRESENCE_THRESHOLDS.none).toBeLessThanOrEqual(PRESENCE_THRESHOLDS.present);
  });
});

describe('presence gate v2 is frozen (tools/presence/FROZEN.md)', () => {
  it('keeps the locked thresholds', () => {
    expect(PRESENCE_THRESHOLDS.present).toBeCloseTo(0.86777, 5);
    expect(PRESENCE_THRESHOLDS.none).toBeCloseTo(0.000564, 6);
  });
});
