import type { Quad } from '../model';

export interface DetectionSample {
  quad: Quad | null;
  confidence: number;
  brightness: number;
  sharpness: number;
  at: number;
}

export type CaptureHint = 'searching' | 'hold_still' | 'too_dark' | 'blurry' | 'ready';

export interface AutoCaptureConfig {
  /** Number of consecutive stable frames before firing. */
  stableFrames: number;
  /** Max corner movement (normalised) to count as stable. */
  maxDrift: number;
  minConfidence: number;
  minBrightness: number;
  minSharpness: number;
  /** Cooldown after a capture, to avoid duplicate shots of the same page. */
  cooldownMs: number;
}

export const defaultAutoCaptureConfig: AutoCaptureConfig = {
  // Frames arrive every ~250 ms: 4 stable frames ≈ 1 s of holding still.
  stableFrames: 4,
  maxDrift: 0.03,
  minConfidence: 0.2,
  minBrightness: 0.18,
  minSharpness: 0.15,
  cooldownMs: 1500,
};

export function quadDrift(a: Quad, b: Quad): number {
  let max = 0;
  for (let i = 0; i < 4; i++) {
    max = Math.max(max, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  }
  return max;
}

/**
 * Pure state machine: feed detection samples, get a hint and whether to fire.
 * Lives in the engine (not the screen) so it is testable and reusable by the SDK.
 */
export class AutoCaptureController {
  private stableCount = 0;
  private last: Quad | null = null;
  private lastFiredAt = -Infinity;
  private firedThisStreak = false;

  constructor(private readonly cfg: AutoCaptureConfig = defaultAutoCaptureConfig) {}

  reset() {
    this.stableCount = 0;
    this.last = null;
    this.firedThisStreak = false;
  }

  push(s: DetectionSample): { hint: CaptureHint; fire: boolean } {
    if (!s.quad || s.confidence < this.cfg.minConfidence) {
      this.reset();
      return { hint: 'searching', fire: false };
    }
    if (s.brightness < this.cfg.minBrightness) {
      this.stableCount = 0;
      this.last = s.quad;
      return { hint: 'too_dark', fire: false };
    }
    if (s.sharpness < this.cfg.minSharpness) {
      this.stableCount = 0;
      this.last = s.quad;
      return { hint: 'blurry', fire: false };
    }
    const steady = this.last !== null && quadDrift(this.last, s.quad) <= this.cfg.maxDrift;
    this.stableCount = steady ? this.stableCount + 1 : 1;
    if (!steady) this.firedThisStreak = false;
    this.last = s.quad;

    if (this.stableCount < this.cfg.stableFrames) return { hint: 'hold_still', fire: false };
    // Ready stays on while the page stays steady (manual capture can rely on it). Auto
    // capture fires once per steady page: a new shot needs the page to move first.
    if (!this.firedThisStreak && s.at - this.lastFiredAt >= this.cfg.cooldownMs) {
      this.lastFiredAt = s.at;
      this.firedThisStreak = true;
      return { hint: 'ready', fire: true };
    }
    return { hint: 'ready', fire: false };
  }
}
