import { Injectable } from '@nestjs/common';
import { numericToSatang, PaymentMethod, PlatformSettings, Satang, VehicleType } from '@ship/shared';
import { DbService, Queryable } from '../../common/db.service';
import { CommissionContext, CommissionRule, PricingRule, resolveCommission } from './pricing.engine';

const DEFAULT_COMMISSION_BP = 800;
const RULE_CACHE_MS = 10_000;

export function mapPricingRule(r: any): PricingRule {
  const fees: Record<string, Satang> = {};
  for (const [k, v] of Object.entries(r.special_service_fees ?? {})) fees[k] = Number(v);
  return {
    id: r.id,
    vehicleType: r.vehicle_type,
    zoneId: r.zone_id,
    baseFare: numericToSatang(r.base_fare),
    perKm: numericToSatang(r.per_km),
    includedKm: Number(r.included_km),
    minimumFare: numericToSatang(r.minimum_fare),
    vehicleFee: numericToSatang(r.vehicle_fee),
    additionalStopFee: numericToSatang(r.additional_stop_fee),
    waitingFeePerMin: numericToSatang(r.waiting_fee_per_min),
    freeWaitingMin: r.free_waiting_min,
    trafficFeePerMin: numericToSatang(r.traffic_fee_per_min),
    specialServiceFees: fees,
    timeMultipliers: r.time_multipliers ?? [],
    allowBelowMargin: r.allow_below_margin,
  };
}

export function mapCommissionRule(r: any): CommissionRule {
  return {
    id: r.id,
    driverId: r.driver_id,
    tier: r.tier,
    vehicleType: r.vehicle_type,
    zoneId: r.zone_id,
    campaign: r.campaign,
    rateBp: r.rate_bp,
    priority: r.priority,
    validFrom: r.valid_from ? new Date(r.valid_from) : null,
    validTo: r.valid_to ? new Date(r.valid_to) : null,
    active: r.active,
  };
}

export interface PromotionEvaluation {
  promotionId: string | null;
  discount: Satang;
  reason?: string;
}

@Injectable()
export class PricingService {
  private commissionCache: { rules: CommissionRule[]; at: number } | null = null;

  constructor(private readonly db: DbService) {}

  /** Zone-specific rule wins over the global (zone_id IS NULL) rule. */
  async findRule(vehicle: VehicleType, zoneId: string | null, at: Date, client?: Queryable): Promise<PricingRule | null> {
    const row = await this.db.one(
      `SELECT * FROM pricing_rules
        WHERE active AND vehicle_type = $1
          AND (zone_id = $2 OR zone_id IS NULL)
          AND effective_from <= $3 AND (effective_to IS NULL OR effective_to > $3)
        ORDER BY (zone_id IS NULL) ASC, effective_from DESC
        LIMIT 1`,
      [vehicle, zoneId, at],
      client,
    );
    return row ? mapPricingRule(row) : null;
  }

  async commissionRules(): Promise<CommissionRule[]> {
    if (this.commissionCache && Date.now() - this.commissionCache.at < RULE_CACHE_MS) return this.commissionCache.rules;
    const rows = await this.db.query('SELECT * FROM commission_rules WHERE active');
    const rules = rows.map(mapCommissionRule);
    this.commissionCache = { rules, at: Date.now() };
    return rules;
  }

  invalidateCommissionCache() {
    this.commissionCache = null;
  }

  async resolveCommissionBp(ctx: CommissionContext): Promise<{ rateBp: number; ruleId: string | null }> {
    const rule = resolveCommission(await this.commissionRules(), ctx);
    return { rateBp: rule?.rateBp ?? DEFAULT_COMMISSION_BP, ruleId: rule?.id ?? null };
  }

  /** Commission used for quoting, before a driver is known: the STANDARD-tier rate. */
  async expectedCommissionBp(vehicle: VehicleType, zoneId: string | null, at: Date) {
    return this.resolveCommissionBp({ vehicleType: vehicle, zoneId, tier: 'STANDARD', at });
  }

  async surgeMilli(zoneId: string | null, vehicle: VehicleType, settings: PlatformSettings): Promise<number> {
    if (!zoneId || !settings.surge.enabled) return 1000;
    const row = await this.db.one<{ milli: number; manual: boolean; manual_until: Date | null }>(
      'SELECT milli, manual, manual_until FROM surge_states WHERE zone_id = $1 AND vehicle_type = $2',
      [zoneId, vehicle],
    );
    if (!row) return 1000;
    if (row.manual && (!row.manual_until || row.manual_until > new Date())) return row.milli;
    return Math.min(settings.surge.maxMilli, Math.max(settings.surge.minMilli, row.milli));
  }

  paymentFeeBp(method: PaymentMethod | undefined, settings: PlatformSettings): number {
    if (!method) return Math.max(...Object.values(settings.paymentFeeBp)); // conservative before method is chosen
    return (settings.paymentFeeBp as Record<string, number>)[method] ?? 0;
  }

  async evaluatePromotion(
    code: string | undefined,
    ctx: { customerId: string; subtotal: Satang; vehicle: VehicleType; zoneId: string | null; at: Date },
  ): Promise<PromotionEvaluation> {
    if (!code) return { promotionId: null, discount: 0 };
    const p = await this.db.one(
      `SELECT * FROM promotions WHERE upper(code) = upper($1) AND active
          AND valid_from <= $2 AND (valid_to IS NULL OR valid_to > $2)`,
      [code, ctx.at],
    );
    if (!p) return { promotionId: null, discount: 0, reason: 'PROMO_NOT_FOUND' };
    if (p.zone_id && p.zone_id !== ctx.zoneId) return { promotionId: null, discount: 0, reason: 'PROMO_ZONE' };
    if (p.vehicle_types?.length && !p.vehicle_types.includes(ctx.vehicle))
      return { promotionId: null, discount: 0, reason: 'PROMO_VEHICLE' };
    if (ctx.subtotal < numericToSatang(p.min_order)) return { promotionId: null, discount: 0, reason: 'PROMO_MIN_ORDER' };
    const used = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM orders o JOIN quotes q ON q.id = o.quote_id
        WHERE o.customer_id = $1 AND q.promotion_id = $2 AND o.status <> 'CANCELLED'`,
      [ctx.customerId, p.id],
    );
    if (Number(used?.n ?? 0) >= p.per_user_limit) return { promotionId: null, discount: 0, reason: 'PROMO_USED' };

    let discount =
      p.discount_type === 'FIXED'
        ? numericToSatang(p.discount_value)
        : Math.floor((ctx.subtotal * Math.round(Number(p.discount_value) * 100)) / 10_000);
    if (p.max_discount !== null) discount = Math.min(discount, numericToSatang(p.max_discount));
    if (p.budget !== null) discount = Math.min(discount, Math.max(0, numericToSatang(p.budget) - numericToSatang(p.spent)));
    discount = Math.min(discount, ctx.subtotal);
    return { promotionId: discount > 0 ? p.id : null, discount };
  }
}
