import type { ScannerEngineSetting, ScannerHealth } from '@/core/config/settingsStore';

/** Which camera a scan uses. */
export type ScannerEngine = 'onescan' | 'google';

export interface EngineAvailability {
  /** OneScan native camera view exists in this build. */
  onescan: boolean;
  /** System document scanner (ML Kit / VisionKit) is callable. */
  google: boolean;
}

/** Consecutive OneScan camera failures after which Auto stops trying it. */
export const MAX_ONESCAN_FAILURES = 2;

/** Failures older than this are forgotten: Auto tries the OneScan camera again. */
export const FAILURE_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;

/** Recent start failures, including a start that never finished (app died while opening). */
export function recentFailures(h: ScannerHealth, now = Date.now()): number {
  const fresh = h.lastFailureAt === undefined || now - h.lastFailureAt < FAILURE_MEMORY_MS;
  return (fresh ? h.failures : 0) + (h.opening ? 1 : 0);
}

export interface EngineChoice {
  engine: ScannerEngine | null;
  /** Auto chose Google because OneScan can't run here (for `engine_fallback`). */
  fallbackReason?: 'disabled' | 'unsupported' | 'crashed';
}

/**
 * Pick the scanner. `auto` (default) = OneScan, unless the flag turns it off, the build
 * lacks it, or it failed to start repeatedly — then the Google/system scanner. An explicit
 * OneScan/Google choice is honoured when that engine exists. Null = neither exists (the
 * screen then uses the plain expo-camera fallback).
 */
export function chooseEngine(
  setting: ScannerEngineSetting,
  customEnabled: boolean,
  available: EngineAvailability,
  health: ScannerHealth,
): EngineChoice {
  if (setting === 'google' && available.google) return { engine: 'google' };
  if (setting === 'onescan' && available.onescan) return { engine: 'onescan' };
  const google = available.google ? 'google' : null;
  if (!available.onescan) return { engine: google, fallbackReason: google ? 'unsupported' : undefined };
  if (setting === 'auto') {
    if (!customEnabled && google) return { engine: 'google', fallbackReason: 'disabled' };
    if (recentFailures(health) >= MAX_ONESCAN_FAILURES && google) return { engine: 'google', fallbackReason: 'crashed' };
  }
  return { engine: 'onescan' };
}
