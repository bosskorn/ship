import { masterProfiles, masterSize, PREVIEW, THUMBNAIL } from '@/core/document-engine/image/quality';
import { pixelRetention } from '@/core/document-engine/image/diagnostics';

const phone12mp = { width: 3024, height: 4032 };

describe('master resolution (v1.0.5)', () => {
  test('High keeps a 12 MP scan at full resolution', () => {
    const m = masterSize(phone12mp, masterProfiles.high);
    expect(m).toEqual(phone12mp);
    expect(pixelRetention(phone12mp, m)).toBeGreaterThanOrEqual(0.7);
  });

  test('a few percent over the cap is kept rather than resampled', () => {
    expect(masterSize({ width: 3000, height: 4400 }, masterProfiles.high)).toEqual({ width: 3000, height: 4400 });
  });

  test('Maximum never resizes; nothing is ever upscaled', () => {
    expect(masterSize({ width: 6120, height: 8160 }, masterProfiles.maximum)).toEqual({ width: 6120, height: 8160 });
    for (const p of Object.values(masterProfiles)) {
      expect(masterSize({ width: 600, height: 800 }, p)).toEqual({ width: 600, height: 800 });
    }
  });

  test('Standard caps the long edge at 2200', () => {
    expect(masterSize(phone12mp, masterProfiles.standard)).toEqual({ width: 1650, height: 2200 });
  });

  test('High stays at or above A4 300 dpi (2480 × 3508) when the source has it', () => {
    const m = masterSize({ width: 3000, height: 4000 }, masterProfiles.high);
    expect(Math.min(m.width, m.height)).toBeGreaterThanOrEqual(2480);
    expect(Math.max(m.width, m.height)).toBeGreaterThanOrEqual(3508);
  });

  test('master JPEG quality ≥ 94 for High/Maximum; preview and thumbnail are smaller tiers', () => {
    expect(masterProfiles.high.quality).toBeGreaterThanOrEqual(94);
    expect(masterProfiles.maximum.quality).toBeGreaterThanOrEqual(95);
    expect(PREVIEW.maxEdge).toBeLessThan(masterProfiles.high.maxEdge);
    expect(THUMBNAIL.maxEdge).toBeLessThanOrEqual(500);
  });
});
