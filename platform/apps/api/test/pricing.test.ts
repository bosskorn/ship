import { describe, expect, it } from 'vitest';
import {
  applyMarginGuard,
  CommissionRule,
  computeMargin,
  computePrice,
  PricingRule,
  resolveCommission,
  resolveTimeMultiplier,
} from '../src/modules/pricing/pricing.engine';
import { DEFAULT_SETTINGS } from '../src/modules/settings/settings.service';

const moto: PricingRule = {
  id: 'r1',
  vehicleType: 'MOTORCYCLE',
  zoneId: null,
  baseFare: 3000,
  perKm: 650,
  includedKm: 0,
  minimumFare: 4500,
  vehicleFee: 0,
  additionalStopFee: 1500,
  waitingFeePerMin: 200,
  freeWaitingMin: 15,
  trafficFeePerMin: 0,
  specialServiceFees: { INSURANCE: 1000, HELPER: 5000 },
  timeMultipliers: [
    { label: 'peak', days: [1, 2, 3, 4, 5], start: '17:00', end: '19:30', milli: 1150 },
    { label: 'night', days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '05:00', milli: 1100 },
  ],
  allowBelowMargin: false,
};

// Wednesday 2026-10-14 10:00 Bangkok = 03:00 UTC (off-peak)
const OFF_PEAK = new Date('2026-10-14T03:00:00Z');
const base = { rule: moto, durationS: 1500, dropoffCount: 1, specialServices: [], at: OFF_PEAK, surgeMilli: 1000, holidays: [] };

describe('computePrice', () => {
  it('prices Lat Phrao -> Bang Na (12.4 km) like the spec example', () => {
    const r = computePrice({ ...base, distanceM: 12_400 });
    // 30 + 6.5 × 12.4 = 110.60 -> whole baht 111
    expect(r.breakdown.baseFare).toBe(3000);
    expect(r.breakdown.distanceFee).toBe(8060);
    expect(r.breakdown.total).toBe(11100);
    expect(r.driverGross).toBe(11100);
    expect(r.breakdown.total % 100).toBe(0);
  });

  it('applies the minimum fare', () => {
    const r = computePrice({ ...base, distanceM: 500 });
    expect(r.breakdown.minimumFareTopUp).toBeGreaterThan(0);
    expect(r.breakdown.total).toBe(4500);
  });

  it('charges additional stops', () => {
    const one = computePrice({ ...base, distanceM: 10_000 });
    const three = computePrice({ ...base, distanceM: 10_000, dropoffCount: 3 });
    expect(three.breakdown.total - one.breakdown.total).toBe(3000);
  });

  it('keeps platform-only services out of the driver gross', () => {
    const r = computePrice({ ...base, distanceM: 10_000, specialServices: ['INSURANCE', 'HELPER'] });
    expect(r.breakdown.specialServicesFee).toBe(6000);
    expect(r.breakdown.total - r.driverGross).toBe(1000);
  });

  it('applies surge and peak multipliers to the distance-driven fare', () => {
    // Wednesday 18:00 Bangkok = 11:00 UTC
    const peak = computePrice({ ...base, distanceM: 10_000, at: new Date('2026-10-14T11:00:00Z') });
    const surge = computePrice({ ...base, distanceM: 10_000, surgeMilli: 1500 });
    const normal = computePrice({ ...base, distanceM: 10_000 });
    expect(peak.timeLabel).toBe('peak');
    expect(peak.breakdown.total).toBeGreaterThan(normal.breakdown.total);
    expect(surge.breakdown.total).toBeGreaterThan(peak.breakdown.total);
    expect(surge.surgeMilli).toBe(1500);
  });

  it('handles windows that wrap midnight and holidays', () => {
    // Thursday 02:00 Bangkok belongs to Wednesday's 22:00-05:00 window
    expect(resolveTimeMultiplier(moto.timeMultipliers, [], new Date('2026-10-14T19:00:00Z')).label).toBe('night');
    const hol = resolveTimeMultiplier([], [{ date: '2026-12-31', label: 'NYE', milli: 1300 }], new Date('2026-12-31T05:00:00Z'));
    expect(hol).toEqual({ milli: 1300, label: 'NYE' });
  });
});

describe('resolveCommission (GP)', () => {
  const r = (x: Partial<CommissionRule>): CommissionRule => ({
    id: Math.random().toString(),
    driverId: null,
    tier: null,
    vehicleType: null,
    zoneId: null,
    campaign: null,
    rateBp: 800,
    priority: 0,
    validFrom: null,
    validTo: null,
    active: true,
    ...x,
  });
  const rules = [
    r({ id: 'new', tier: 'NEW', rateBp: 0 }),
    r({ id: 'std', tier: 'STANDARD', rateBp: 800 }),
    r({ id: 'gold', tier: 'GOLD', rateBp: 600 }),
    r({ id: 'zone', tier: 'STANDARD', zoneId: 'z1', rateBp: 500 }),
    r({ id: 'driver', driverId: 'd9', rateBp: 300 }),
    r({ id: 'promo', vehicleType: 'CAR', rateBp: 400, priority: 10, validFrom: new Date('2026-10-01'), validTo: new Date('2026-11-01') }),
  ];
  const at = new Date('2026-10-14T03:00:00Z');

  it('uses the tier rate', () => {
    expect(resolveCommission(rules, { tier: 'NEW', vehicleType: 'MOTORCYCLE', at })?.rateBp).toBe(0);
    expect(resolveCommission(rules, { tier: 'GOLD', vehicleType: 'MOTORCYCLE', at })?.rateBp).toBe(600);
  });
  it('prefers the more specific rule at equal priority', () => {
    expect(resolveCommission(rules, { tier: 'STANDARD', zoneId: 'z1', vehicleType: 'MOTORCYCLE', at })?.id).toBe('zone');
    expect(resolveCommission(rules, { driverId: 'd9', tier: 'STANDARD', zoneId: 'z1', vehicleType: 'MOTORCYCLE', at })?.id).toBe('driver');
  });
  it('lets priority win and respects validity windows', () => {
    expect(resolveCommission(rules, { tier: 'STANDARD', vehicleType: 'CAR', at })?.id).toBe('promo');
    expect(resolveCommission(rules, { tier: 'STANDARD', vehicleType: 'CAR', at: new Date('2026-12-01') })?.id).toBe('std');
  });
});

describe('margin guard', () => {
  const settings = { ...DEFAULT_SETTINGS, minContributionMarginSatang: 500 };
  const price = computePrice({ ...base, distanceM: 12_400 }); // ฿111

  it('computes contribution margin', () => {
    const m = computeMargin({
      customerPayment: 11100,
      subtotal: 11100,
      driverGross: 11100,
      tollParking: 0,
      commissionBp: 800,
      driverIncentive: 0,
      paymentFeeBp: 0,
      insuranceRiskBp: 100,
      otherVariableCost: 100,
    });
    expect(m.commission).toBe(888);
    expect(m.driverNet).toBe(10212);
    // 111 - 102.12 - 1.11 - 1.00 = 6.77
    expect(m.contributionMargin).toBe(677);
  });

  it('passes healthy quotes untouched', () => {
    const g = applyMarginGuard({ price, promotionDiscount: 0, commissionBp: 800, driverIncentive: 0, paymentFeeBp: 0, settings, allowBelowMargin: false });
    expect(g.available).toBe(true);
    expect(g.actions).toHaveLength(0);
  });

  it('caps a promotion that would push margin below the floor', () => {
    const g = applyMarginGuard({ price, promotionDiscount: 5000, commissionBp: 800, driverIncentive: 0, paymentFeeBp: 0, settings, allowBelowMargin: false });
    expect(g.available).toBe(true);
    expect(g.breakdown.promotionDiscount).toBeLessThan(5000);
    expect(g.margin.contributionMargin).toBeGreaterThanOrEqual(500);
  });

  it('blocks the option when margin cannot be met, unless overridden', () => {
    const blocked = applyMarginGuard({ price, promotionDiscount: 0, commissionBp: 0, driverIncentive: 0, paymentFeeBp: 290, settings, allowBelowMargin: false });
    expect(blocked.available).toBe(false);
    expect(blocked.reason).toBe('MARGIN_GUARD');
    const overridden = applyMarginGuard({ price, promotionDiscount: 0, commissionBp: 0, driverIncentive: 0, paymentFeeBp: 290, settings, allowBelowMargin: true });
    expect(overridden.available).toBe(true);
  });

  it('adds a platform service fee in SERVICE_FEE mode', () => {
    const g = applyMarginGuard({
      price,
      promotionDiscount: 0,
      commissionBp: 0,
      driverIncentive: 0,
      paymentFeeBp: 290,
      settings: { ...settings, marginGuardMode: 'SERVICE_FEE' },
      allowBelowMargin: false,
    });
    expect(g.available).toBe(true);
    expect(g.breakdown.serviceFee).toBeGreaterThan(0);
    expect(g.breakdown.total).toBe(g.breakdown.subtotal + g.breakdown.serviceFee);
    expect(g.margin.contributionMargin).toBeGreaterThanOrEqual(500);
  });
});
