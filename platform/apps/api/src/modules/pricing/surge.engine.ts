import type { PlatformSettings } from '@ship/shared';

export interface SurgeInput {
  demand: number;
  supply: number;
  currentMilli: number;
  changedAt: Date;
  now: Date;
  settings: PlatformSettings['surge'];
}

/** milli added per unit of demand/supply ratio above 1. */
const SLOPE_MILLI = 250;
/** Largest change allowed per evaluation, to avoid price shocks. */
const MAX_STEP_MILLI = 200;
const GRANULARITY = 50;

/**
 * Supply/demand surge (spec §29). Returns the new multiplier, or null when it must not
 * change (cooldown, or no material difference).
 */
export function computeSurge(i: SurgeInput): number | null {
  if (!i.settings.enabled) return i.currentMilli === 1000 ? null : 1000;
  const ratio = i.demand / Math.max(1, i.supply);
  let target = ratio <= 1 ? 1000 : 1000 + (ratio - 1) * SLOPE_MILLI;
  target = Math.round(target / GRANULARITY) * GRANULARITY;
  target = Math.min(i.settings.maxMilli, Math.max(i.settings.minMilli, target));

  if (target === i.currentMilli) return null;
  if (i.now.getTime() - i.changedAt.getTime() < i.settings.cooldownSeconds * 1000) return null;

  const step = Math.max(-MAX_STEP_MILLI, Math.min(MAX_STEP_MILLI, target - i.currentMilli));
  return i.currentMilli + step;
}
