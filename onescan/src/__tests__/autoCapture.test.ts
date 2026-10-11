import { AutoCaptureController, DetectionSample } from '@/core/document-engine/capture/autoCapture';
import type { Quad } from '@/core/document-engine/model';

const quad = (o = 0): Quad => [
  { x: 0.1 + o, y: 0.1 },
  { x: 0.9 + o, y: 0.1 },
  { x: 0.9 + o, y: 0.9 },
  { x: 0.1 + o, y: 0.9 },
];
const good = (at: number, o = 0): DetectionSample => ({ quad: quad(o), confidence: 0.95, brightness: 0.6, sharpness: 0.8, at });

describe('AutoCaptureController', () => {
  it('fires after N stable frames, then respects cooldown', () => {
    const c = new AutoCaptureController({ stableFrames: 3, maxDrift: 0.02, minConfidence: 0.7, minBrightness: 0.2, minSharpness: 0.3, cooldownMs: 1000 });
    expect(c.push(good(0)).fire).toBe(false);
    expect(c.push(good(10)).fire).toBe(false);
    expect(c.push(good(20))).toEqual({ hint: 'ready', fire: true });
    // Within cooldown: no second shot even if stable.
    for (let t = 30; t < 200; t += 10) expect(c.push(good(t)).fire).toBe(false);
    expect(c.push(good(1100)).fire).toBe(true);
  });

  it('resets on movement and reports quality hints', () => {
    const c = new AutoCaptureController({ stableFrames: 2, maxDrift: 0.02, minConfidence: 0.7, minBrightness: 0.2, minSharpness: 0.3, cooldownMs: 0 });
    c.push(good(0));
    expect(c.push(good(10, 0.1)).fire).toBe(false); // moved
    expect(c.push({ ...good(20), brightness: 0.05 }).hint).toBe('too_dark');
    expect(c.push({ ...good(30), sharpness: 0.1 }).hint).toBe('blurry');
    expect(c.push({ ...good(40), quad: null }).hint).toBe('searching');
  });
});
