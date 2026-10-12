import { bearingDegrees, headingDelta, LatLng, PlatformSettings } from '@ship/shared';

export interface Candidate {
  driverId: string;
  location: LatLng;
  heading: number | null;
  speedMs: number | null;
  distanceToPickupM: number;
  etaToPickupS: number;
  offersReceived: number;
  offersAccepted: number;
  tripsCompleted: number;
  tripsCancelled: number;
  ratingSum: number;
  ratingCount: number;
  inOrderZone: boolean;
  activeJobs: number;
  riskScore: number;
}

export interface ScoreBreakdown {
  pickupEta: number;
  deadMileage: number;
  reliability: number;
  rating: number;
  zoneMismatch: number;
  workload: number;
  direction: number;
  total: number;
  acceptanceRate: number;
  cancellationRate: number;
}

/** Below this many offers/trips, use priors instead of noisy observed rates. */
const MIN_SAMPLE = 10;
const PRIOR_ACCEPTANCE = 0.85;
const PRIOR_CANCELLATION = 0.03;
const PRIOR_RATING = 4.7;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Candidate score (spec §18). Lower is better. Each component is normalised to ~0..1 so the
 * admin-tunable weights are comparable. Not "nearest driver": a slightly farther driver who
 * is heading towards the pickup and reliably accepts can win.
 */
export function scoreCandidate(c: Candidate, pickup: LatLng, w: PlatformSettings['dispatchWeights']): ScoreBreakdown {
  const acceptanceRate = c.offersReceived >= MIN_SAMPLE ? c.offersAccepted / c.offersReceived : PRIOR_ACCEPTANCE;
  const trips = c.tripsCompleted + c.tripsCancelled;
  const cancellationRate = trips >= MIN_SAMPLE ? c.tripsCancelled / trips : PRIOR_CANCELLATION;
  const rating = c.ratingCount >= 5 ? c.ratingSum / c.ratingCount : PRIOR_RATING;

  let direction = 0;
  if (c.heading !== null && (c.speedMs ?? 0) > 2 && c.distanceToPickupM > 300) {
    // moving away from the pickup costs a U-turn; 0 = heading straight to it, 1 = opposite
    direction = headingDelta(c.heading, bearingDegrees(c.location, pickup)) / 180;
  }

  const parts = {
    pickupEta: clamp01(c.etaToPickupS / 900) * w.pickupEta, // 15 min = 1
    deadMileage: clamp01(c.distanceToPickupM / 6000) * w.deadMileage, // 6 km = 1
    reliability: clamp01(1 - acceptanceRate + 3 * cancellationRate) * w.reliability,
    rating: clamp01((5 - rating) / 2) * w.rating,
    zoneMismatch: (c.inOrderZone ? 0 : 1) * w.zoneMismatch,
    workload: clamp01(c.activeJobs / 2) * w.workload,
    direction: direction * w.direction,
  };
  const total = Object.values(parts).reduce((s, v) => s + v, 0);
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return {
    pickupEta: round(parts.pickupEta),
    deadMileage: round(parts.deadMileage),
    reliability: round(parts.reliability),
    rating: round(parts.rating),
    zoneMismatch: round(parts.zoneMismatch),
    workload: round(parts.workload),
    direction: round(parts.direction),
    total: round(total),
    acceptanceRate: round(acceptanceRate),
    cancellationRate: round(cancellationRate),
  };
}
