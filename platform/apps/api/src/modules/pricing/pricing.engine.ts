/**
 * Pure pricing / commission / margin functions. No I/O: everything the engine needs is
 * passed in, which keeps it unit-testable and makes every quote reproducible from the
 * inputs stored on the quote row.
 *
 * All money is integer satang.
 */
import { applyBasisPoints, applyMilli, PlatformSettings, QuoteBreakdown, roundUpTo, Satang, VehicleType } from '@ship/shared';

export interface TimeMultiplier {
  label: string;
  days: number[]; // 0 = Sunday, Asia/Bangkok local
  start: string; // HH:mm
  end: string; // HH:mm, may wrap past midnight
  milli: number;
}

export interface PricingRule {
  id: string;
  vehicleType: VehicleType;
  zoneId: string | null;
  baseFare: Satang;
  perKm: Satang;
  includedKm: number;
  minimumFare: Satang;
  vehicleFee: Satang;
  additionalStopFee: Satang;
  waitingFeePerMin: Satang;
  freeWaitingMin: number;
  trafficFeePerMin: Satang;
  specialServiceFees: Partial<Record<SpecialService, Satang>>;
  timeMultipliers: TimeMultiplier[];
  allowBelowMargin: boolean;
}

export type SpecialService = 'HELPER' | 'RETURN_TRIP' | 'INSURANCE';
/** Special services whose fee is platform revenue rather than driver fare. */
const PLATFORM_SERVICES: SpecialService[] = ['INSURANCE'];

export interface CommissionRule {
  id: string;
  driverId: string | null;
  tier: string | null;
  vehicleType: VehicleType | null;
  zoneId: string | null;
  campaign: string | null;
  rateBp: number;
  priority: number;
  validFrom: Date | null;
  validTo: Date | null;
  active: boolean;
}

export interface CommissionContext {
  driverId?: string | null;
  tier?: string | null;
  vehicleType: VehicleType;
  zoneId?: string | null;
  campaign?: string | null;
  at: Date;
}

export interface PriceInput {
  rule: PricingRule;
  distanceM: number;
  durationS: number;
  dropoffCount: number;
  specialServices: SpecialService[];
  at: Date;
  surgeMilli: number;
  holidays: PlatformSettings['holidays'];
  /** Estimated tolls/parking (pass-through to driver, not commissioned). */
  tollParking?: Satang;
}

export interface PriceResult {
  breakdown: QuoteBreakdown;
  /** Fare the driver's commission is computed on (excludes platform-only fees, tolls). */
  driverGross: Satang;
  timeMilli: number;
  timeLabel: string | null;
  surgeMilli: number;
}

export interface MarginInput {
  customerPayment: Satang;
  subtotal: Satang;
  driverGross: Satang;
  tollParking: Satang;
  commissionBp: number;
  driverIncentive: Satang;
  paymentFeeBp: number;
  insuranceRiskBp: number;
  otherVariableCost: Satang;
}

export interface MarginResult {
  customerPayment: Satang;
  driverGross: Satang;
  commission: Satang;
  commissionBp: number;
  driverIncentive: Satang;
  driverNet: Satang;
  paymentFee: Satang;
  promotionSubsidy: Satang;
  insuranceRisk: Satang;
  otherVariableCost: Satang;
  contributionMargin: Satang;
}

/** Reference free-flow speed for traffic adjustment (m/s, ~30 km/h). */
const FREE_FLOW_MS = 8.33;
const BKK_OFFSET_MS = 7 * 3600_000;

export function divRound(a: number, b: number): number {
  // integer division rounding half away from zero, avoiding float drift for large a
  const q = Math.trunc(a / b);
  const r = a - q * b;
  if (Math.abs(r) * 2 >= Math.abs(b)) return q + Math.sign(a) * Math.sign(b);
  return q;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Bangkok local wall-clock parts (Thailand has no DST). */
export function bangkokParts(at: Date) {
  const local = new Date(at.getTime() + BKK_OFFSET_MS);
  return {
    day: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    date: local.toISOString().slice(0, 10),
  };
}

export function resolveTimeMultiplier(
  windows: TimeMultiplier[],
  holidays: PlatformSettings['holidays'],
  at: Date,
): { milli: number; label: string | null } {
  const { day, minutes, date } = bangkokParts(at);
  let best = { milli: 1000, label: null as string | null };
  const holiday = holidays.find((h) => h.date === date);
  if (holiday) best = { milli: holiday.milli, label: holiday.label };
  for (const w of windows) {
    const s = toMinutes(w.start);
    const e = toMinutes(w.end);
    let inWindow: boolean;
    if (s <= e) inWindow = w.days.includes(day) && minutes >= s && minutes < e;
    else {
      // wraps midnight: the part after midnight belongs to the previous day's window
      const prevDay = (day + 6) % 7;
      inWindow = (w.days.includes(day) && minutes >= s) || (w.days.includes(prevDay) && minutes < e);
    }
    if (inWindow && w.milli > best.milli) best = { milli: w.milli, label: w.label };
  }
  return best;
}

export function computePrice(input: PriceInput): PriceResult {
  const { rule } = input;
  const billableM = Math.max(0, input.distanceM - Math.round(rule.includedKm * 1000));
  const baseFare = rule.baseFare;
  const distanceFee = divRound(rule.perKm * billableM, 1000);
  const vehicleFee = rule.vehicleFee;
  const additionalStopsFee = Math.max(0, input.dropoffCount - 1) * rule.additionalStopFee;

  let driverServices = 0;
  let platformServices = 0;
  for (const s of new Set(input.specialServices)) {
    const fee = rule.specialServiceFees[s] ?? 0;
    if (PLATFORM_SERVICES.includes(s)) platformServices += fee;
    else driverServices += fee;
  }
  const specialServicesFee = driverServices + platformServices;

  const expectedS = input.distanceM / FREE_FLOW_MS;
  const extraMin = Math.max(0, Math.floor((input.durationS - expectedS) / 60));
  const trafficAdjustment = extraMin * rule.trafficFeePerMin;

  const time = resolveTimeMultiplier(rule.timeMultipliers, input.holidays, input.at);
  const surgeMilli = Math.max(1000, input.surgeMilli);
  // demand adjustment = (surge × time-of-day) applied to the distance-driven part of the fare
  const core = baseFare + distanceFee;
  const combinedMilli = divRound(surgeMilli * time.milli, 1000);
  const demandAdjustment = applyMilli(core, combinedMilli) - core;

  const tollParking = input.tollParking ?? 0;
  let subtotal =
    baseFare + distanceFee + vehicleFee + additionalStopsFee + specialServicesFee + trafficAdjustment + demandAdjustment;
  const minimumFareTopUp = Math.max(0, rule.minimumFare - subtotal);
  subtotal += minimumFareTopUp;
  // Customer-facing prices are whole baht; the rounding goes to the driver fare.
  const rounded = roundUpTo(subtotal, 100);
  const roundingDelta = rounded - subtotal;
  subtotal = rounded + tollParking;

  const breakdown: QuoteBreakdown = {
    baseFare,
    distanceFee,
    vehicleFee,
    additionalStopsFee,
    specialServicesFee,
    tollParking,
    demandAdjustment: demandAdjustment + roundingDelta,
    trafficAdjustment,
    minimumFareTopUp,
    serviceFee: 0,
    subtotal,
    promotionDiscount: 0,
    total: subtotal,
  };
  return {
    breakdown,
    driverGross: subtotal - platformServices - tollParking,
    timeMilli: time.milli,
    timeLabel: time.label,
    surgeMilli,
  };
}

/** Pick the commission (GP) rule for a context: highest priority, then most specific. */
export function resolveCommission(rules: CommissionRule[], ctx: CommissionContext): CommissionRule | null {
  const matches = rules.filter((r) => {
    if (!r.active) return false;
    if (r.validFrom && ctx.at < r.validFrom) return false;
    if (r.validTo && ctx.at >= r.validTo) return false;
    if (r.driverId && r.driverId !== ctx.driverId) return false;
    if (r.tier && r.tier !== ctx.tier) return false;
    if (r.vehicleType && r.vehicleType !== ctx.vehicleType) return false;
    if (r.zoneId && r.zoneId !== ctx.zoneId) return false;
    if (r.campaign && r.campaign !== ctx.campaign) return false;
    return true;
  });
  const specificity = (r: CommissionRule) =>
    (r.driverId ? 16 : 0) + (r.campaign ? 8 : 0) + (r.zoneId ? 4 : 0) + (r.vehicleType ? 2 : 0) + (r.tier ? 1 : 0);
  matches.sort((a, b) => b.priority - a.priority || specificity(b) - specificity(a));
  return matches[0] ?? null;
}

export function computeMargin(m: MarginInput): MarginResult {
  const commission = applyBasisPoints(m.driverGross, m.commissionBp);
  const driverNet = m.driverGross - commission + m.driverIncentive + m.tollParking;
  const paymentFee = applyBasisPoints(m.customerPayment, m.paymentFeeBp);
  const insuranceRisk = applyBasisPoints(m.customerPayment, m.insuranceRiskBp);
  const contributionMargin = m.customerPayment - driverNet - paymentFee - insuranceRisk - m.otherVariableCost;
  return {
    customerPayment: m.customerPayment,
    driverGross: m.driverGross,
    commission,
    commissionBp: m.commissionBp,
    driverIncentive: m.driverIncentive,
    driverNet,
    paymentFee,
    promotionSubsidy: m.subtotal - m.customerPayment,
    insuranceRisk,
    otherVariableCost: m.otherVariableCost,
    contributionMargin,
  };
}

export interface GuardInput {
  price: PriceResult;
  promotionDiscount: Satang;
  commissionBp: number;
  driverIncentive: Satang;
  paymentFeeBp: number;
  settings: Pick<PlatformSettings, 'minContributionMarginSatang' | 'insuranceRiskBp' | 'otherVariableCostSatang' | 'marginGuardMode'>;
  allowBelowMargin: boolean;
}

export interface GuardResult {
  breakdown: QuoteBreakdown;
  margin: MarginResult;
  available: boolean;
  reason: string | null;
  /** Human-readable trace of what the guard changed. */
  actions: string[];
}

/**
 * Margin guard (spec §11). Order of remedies:
 *   1. shrink the promotion discount (never subsidise below the floor)
 *   2. SERVICE_FEE mode: add a platform-only service fee to close the gap
 *   3. otherwise block the option unless the pricing rule has an explicit override
 */
export function applyMarginGuard(g: GuardInput): GuardResult {
  const actions: string[] = [];
  const min = g.settings.minContributionMarginSatang;
  const bd: QuoteBreakdown = { ...g.price.breakdown };
  let discount = Math.min(g.promotionDiscount, bd.subtotal);

  const evaluate = () => {
    bd.promotionDiscount = discount;
    bd.total = bd.subtotal + bd.serviceFee - discount;
    return computeMargin({
      customerPayment: bd.total,
      subtotal: bd.subtotal + bd.serviceFee,
      driverGross: g.price.driverGross,
      tollParking: bd.tollParking,
      commissionBp: g.commissionBp,
      driverIncentive: g.driverIncentive,
      paymentFeeBp: g.paymentFeeBp,
      insuranceRiskBp: g.settings.insuranceRiskBp,
      otherVariableCost: g.settings.otherVariableCostSatang,
    });
  };

  let margin = evaluate();
  if (margin.contributionMargin >= min) return { breakdown: bd, margin, available: true, reason: null, actions };

  if (discount > 0) {
    const deficit = min - margin.contributionMargin;
    // Each satang of discount removed raises payment by 1 and fees by ~fee%; iterate to be exact.
    discount = Math.max(0, discount - deficit);
    margin = evaluate();
    while (discount > 0 && margin.contributionMargin < min) {
      discount = Math.max(0, discount - 100);
      margin = evaluate();
    }
    actions.push(`promotion capped to ${discount}`);
    if (margin.contributionMargin >= min) return { breakdown: bd, margin, available: true, reason: null, actions };
  }

  if (g.allowBelowMargin) {
    actions.push('below-margin override on pricing rule');
    return { breakdown: bd, margin, available: true, reason: null, actions };
  }

  if (g.settings.marginGuardMode === 'SERVICE_FEE') {
    let fee = roundUpTo(min - margin.contributionMargin, 100);
    bd.serviceFee = fee;
    margin = evaluate();
    while (margin.contributionMargin < min) {
      fee += 100;
      bd.serviceFee = fee;
      margin = evaluate();
    }
    actions.push(`service fee ${fee} added`);
    return { breakdown: bd, margin, available: true, reason: null, actions };
  }

  return { breakdown: bd, margin, available: false, reason: 'MARGIN_GUARD', actions };
}
