import { describe, expect, it } from 'vitest';
import { Candidate, scoreCandidate } from '../src/modules/dispatch/dispatch.scoring';
import { periodStart } from '../src/modules/earnings/earnings.service';
import { computeSurge } from '../src/modules/pricing/surge.engine';
import { HeuristicRouteOptimizer } from '../src/modules/routing/optimizer';
import { DEFAULT_SETTINGS } from '../src/modules/settings/settings.service';

const pickup = { lat: 13.8167, lng: 100.5615 };
const W = DEFAULT_SETTINGS.dispatchWeights;
const cand = (x: Partial<Candidate>): Candidate => ({
  driverId: 'd',
  location: { lat: 13.83, lng: 100.57 },
  heading: null,
  speedMs: null,
  distanceToPickupM: 1500,
  etaToPickupS: 240,
  offersReceived: 50,
  offersAccepted: 45,
  tripsCompleted: 100,
  tripsCancelled: 1,
  ratingSum: 480,
  ratingCount: 100,
  inOrderZone: true,
  activeJobs: 0,
  riskScore: 0,
  ...x,
});

describe('dispatch scoring', () => {
  it('prefers a closer driver, all else equal', () => {
    const near = scoreCandidate(cand({ distanceToPickupM: 800, etaToPickupS: 150 }), pickup, W);
    const far = scoreCandidate(cand({ distanceToPickupM: 4000, etaToPickupS: 700 }), pickup, W);
    expect(near.total).toBeLessThan(far.total);
  });

  it('is not nearest-only: a reliable driver can beat a slightly closer unreliable one', () => {
    const unreliable = scoreCandidate(cand({ distanceToPickupM: 1200, etaToPickupS: 200, offersAccepted: 15, tripsCancelled: 20 }), pickup, W);
    const reliable = scoreCandidate(cand({ distanceToPickupM: 1500, etaToPickupS: 240 }), pickup, W);
    expect(reliable.total).toBeLessThan(unreliable.total);
  });

  it('penalises drivers moving away from the pickup', () => {
    // driver north-east of pickup; pickup bearing is roughly south-west (~215°)
    const toward = scoreCandidate(cand({ heading: 215, speedMs: 8 }), pickup, W);
    const away = scoreCandidate(cand({ heading: 35, speedMs: 8 }), pickup, W);
    expect(toward.direction).toBeLessThan(away.direction);
    expect(toward.total).toBeLessThan(away.total);
  });

  it('uses priors for new drivers instead of noisy rates', () => {
    const fresh = scoreCandidate(cand({ offersReceived: 1, offersAccepted: 0, tripsCompleted: 0, tripsCancelled: 1, ratingCount: 0, ratingSum: 0 }), pickup, W);
    expect(fresh.acceptanceRate).toBe(0.85);
    expect(fresh.cancellationRate).toBe(0.03);
  });
});

describe('surge engine', () => {
  const s = DEFAULT_SETTINGS.surge;
  const now = new Date('2026-10-14T10:00:00Z');
  const long = new Date('2026-10-14T09:00:00Z');

  it('raises price when demand exceeds supply, in bounded steps', () => {
    // 20 orders / 5 drivers -> ratio 4 -> target 1750 but max step 200
    expect(computeSurge({ demand: 20, supply: 5, currentMilli: 1000, changedAt: long, now, settings: s })).toBe(1200);
  });
  it('respects the cap and cooldown', () => {
    expect(computeSurge({ demand: 100, supply: 1, currentMilli: 1700, changedAt: long, now, settings: s })).toBe(1800);
    expect(computeSurge({ demand: 100, supply: 1, currentMilli: 1200, changedAt: new Date(now.getTime() - 60_000), now, settings: s })).toBeNull();
  });
  it('relaxes back to 1.0x when supply recovers', () => {
    expect(computeSurge({ demand: 2, supply: 10, currentMilli: 1300, changedAt: long, now, settings: s })).toBe(1100);
    expect(computeSurge({ demand: 2, supply: 10, currentMilli: 1000, changedAt: long, now, settings: s })).toBeNull();
  });
});

describe('multi-stop optimizer', () => {
  it('orders stops by proximity but keeps locked stops in place', async () => {
    const opt = new HeuristicRouteOptimizer();
    const start = { lat: 13.8, lng: 100.55 };
    const stops = [
      { location: { lat: 13.9, lng: 100.55 } }, // far
      { location: { lat: 13.81, lng: 100.55 } }, // nearest
      { location: { lat: 13.85, lng: 100.55 } }, // middle
    ];
    expect(await opt.optimize(start, stops)).toEqual([1, 2, 0]);
    const locked = [{ ...stops[0], locked: true }, stops[1], stops[2]];
    const order = await opt.optimize(start, locked);
    expect(order[0]).toBe(0);
    expect(order.slice(1).sort()).toEqual([1, 2]);
  });
});

describe('earnings periods (Asia/Bangkok)', () => {
  it('starts today at local midnight and weeks on Monday', () => {
    // Wed 2026-10-14 01:00 Bangkok = Tue 18:00 UTC
    const now = new Date('2026-10-13T18:00:00Z');
    expect(periodStart('today', now).toISOString()).toBe('2026-10-13T17:00:00.000Z');
    expect(periodStart('week', now).toISOString()).toBe('2026-10-11T17:00:00.000Z');
    expect(periodStart('month', now).toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });
});
