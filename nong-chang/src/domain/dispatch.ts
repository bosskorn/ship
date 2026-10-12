/**
 * Dispatch engine (spec §54). Produces a 0–100 matching score per
 * technician. Weights are admin-configurable and are normalised so they
 * always sum to 1.
 */
export interface DispatchWeights {
  distance: number;
  skill: number;
  jobSuccess: number;
  rating: number;
  acceptanceRate: number;
  cancellation: number;
}

export const DEFAULT_WEIGHTS: DispatchWeights = {
  distance: 35,
  skill: 25,
  jobSuccess: 15,
  rating: 10,
  acceptanceRate: 10,
  cancellation: 5,
};

export interface Candidate {
  id: string;
  online: boolean;
  busy: boolean;
  distanceKm: number;
  /** Skill tags, e.g. 'aircon', 'plumbing'. */
  skills: string[];
  rating: number; // 0–5
  successRate: number; // 0–1
  acceptanceRate: number; // 0–1
  cancellationRate: number; // 0–1
  /** Optional routed ETA in minutes; falls back to distance-based estimate. */
  etaMinutes?: number;
}

export interface DispatchRequest {
  skill: string;
  maxDistanceKm?: number;
  weights?: DispatchWeights;
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  etaMinutes: number;
  parts: Record<keyof DispatchWeights, number>;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Rough urban ETA: 4 min fixed + 3 min/km (Bangkok traffic). */
export function estimateEta(distanceKm: number) {
  return Math.round(4 + distanceKm * 3);
}

export function scoreCandidate(c: Candidate, req: DispatchRequest): ScoredCandidate {
  const maxKm = req.maxDistanceKm ?? 10;
  const w = req.weights ?? DEFAULT_WEIGHTS;
  const sum = Object.values(w).reduce((s, v) => s + v, 0) || 1;

  const parts = {
    distance: clamp01(1 - c.distanceKm / maxKm),
    skill: c.skills.includes(req.skill) ? 1 : 0,
    jobSuccess: clamp01(c.successRate),
    rating: clamp01((c.rating - 3) / 2), // 3★ → 0, 5★ → 1
    acceptanceRate: clamp01(c.acceptanceRate),
    cancellation: clamp01(1 - c.cancellationRate * 5), // 20%+ cancels → 0
  };

  const score = (Object.keys(parts) as (keyof DispatchWeights)[]).reduce((s, k) => s + (parts[k] * w[k]) / sum, 0);

  return {
    candidate: c,
    score: Math.round(score * 1000) / 10,
    etaMinutes: c.etaMinutes ?? estimateEta(c.distanceKm),
    parts,
  };
}

/**
 * Eligible = online, not busy, has the skill, within radius.
 * Sorted by score desc, then ETA asc.
 */
export function rankCandidates(candidates: Candidate[], req: DispatchRequest): ScoredCandidate[] {
  const maxKm = req.maxDistanceKm ?? 10;
  return candidates
    .filter((c) => c.online && !c.busy && c.skills.includes(req.skill) && c.distanceKm <= maxKm)
    .map((c) => scoreCandidate(c, req))
    .sort((a, b) => b.score - a.score || a.etaMinutes - b.etaMinutes);
}
