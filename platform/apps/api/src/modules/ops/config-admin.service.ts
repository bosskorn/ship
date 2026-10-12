import { Injectable } from '@nestjs/common';
import { CommissionRuleInput, numericToSatang, PricingRuleInput, satangToNumeric } from '@ship/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { PricingService } from '../pricing/pricing.service';

/** Pricing / GP / promotion configuration (spec §10, §27). Changes apply without a deploy and are audited. */
@Injectable()
export class ConfigAdminService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
  ) {}

  private pricingParams(p: PricingRuleInput) {
    return [
      p.name,
      p.vehicleType,
      p.zoneId ?? null,
      satangToNumeric(p.baseFare),
      satangToNumeric(p.perKm),
      p.includedKm,
      satangToNumeric(p.minimumFare),
      satangToNumeric(p.vehicleFee),
      satangToNumeric(p.additionalStopFee),
      satangToNumeric(p.waitingFeePerMin),
      p.freeWaitingMin,
      satangToNumeric(p.trafficFeePerMin),
      JSON.stringify(p.specialServiceFees ?? {}),
      JSON.stringify(p.timeMultipliers),
      p.allowBelowMargin,
      p.active,
      p.effectiveFrom ?? new Date().toISOString(),
      p.effectiveTo ?? null,
    ];
  }

  async listPricing() {
    const rows = await this.db.query(
      `SELECT r.*, z.code AS zone_code FROM pricing_rules r LEFT JOIN service_zones z ON z.id = r.zone_id
        ORDER BY r.vehicle_type, r.zone_id NULLS FIRST, r.effective_from DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      vehicleType: r.vehicle_type,
      zoneId: r.zone_id,
      zoneCode: r.zone_code,
      baseFare: numericToSatang(r.base_fare),
      perKm: numericToSatang(r.per_km),
      includedKm: Number(r.included_km),
      minimumFare: numericToSatang(r.minimum_fare),
      vehicleFee: numericToSatang(r.vehicle_fee),
      additionalStopFee: numericToSatang(r.additional_stop_fee),
      waitingFeePerMin: numericToSatang(r.waiting_fee_per_min),
      freeWaitingMin: r.free_waiting_min,
      trafficFeePerMin: numericToSatang(r.traffic_fee_per_min),
      specialServiceFees: r.special_service_fees,
      timeMultipliers: r.time_multipliers,
      allowBelowMargin: r.allow_below_margin,
      active: r.active,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      updatedAt: r.updated_at,
    }));
  }

  async createPricing(actor: AuthUser, p: PricingRuleInput, reason?: string) {
    return this.db.tx(async (c) => {
      const row = await this.db.one(
        `INSERT INTO pricing_rules (name, vehicle_type, zone_id, base_fare, per_km, included_km, minimum_fare, vehicle_fee,
            additional_stop_fee, waiting_fee_per_min, free_waiting_min, traffic_fee_per_min, special_service_fees, time_multipliers,
            allow_below_margin, active, effective_from, effective_to, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
        [...this.pricingParams(p), actor.id],
        c,
      );
      await this.audit.log({ actor, action: 'pricing_rule.create', entityType: 'pricing_rule', entityId: row.id, after: p, reason }, c);
      return row;
    });
  }

  async updatePricing(actor: AuthUser, id: string, p: PricingRuleInput, reason?: string) {
    return this.db.tx(async (c) => {
      const before = await this.db.one('SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE', [id], c);
      if (!before) throw NotFound('Pricing rule');
      await this.db.query(
        `UPDATE pricing_rules SET name=$1, vehicle_type=$2, zone_id=$3, base_fare=$4, per_km=$5, included_km=$6, minimum_fare=$7,
            vehicle_fee=$8, additional_stop_fee=$9, waiting_fee_per_min=$10, free_waiting_min=$11, traffic_fee_per_min=$12,
            special_service_fees=$13, time_multipliers=$14, allow_below_margin=$15, active=$16, effective_from=$17, effective_to=$18,
            updated_at = now()
          WHERE id = $19`,
        [...this.pricingParams(p), id],
        c,
      );
      await this.audit.log({ actor, action: 'pricing_rule.update', entityType: 'pricing_rule', entityId: id, before, after: p, reason }, c);
      return { id };
    });
  }

  async listCommission() {
    return this.db.query(
      `SELECT r.*, z.code AS zone_code, coalesce(d.first_name || ' ' || d.last_name, NULL) AS driver_name
         FROM commission_rules r LEFT JOIN service_zones z ON z.id = r.zone_id LEFT JOIN drivers d ON d.id = r.driver_id
        ORDER BY r.active DESC, r.priority DESC, r.created_at`,
    );
  }

  private commissionParams(r: CommissionRuleInput) {
    return [
      r.name,
      r.driverId ?? null,
      r.tier ?? null,
      r.vehicleType ?? null,
      r.zoneId ?? null,
      r.campaign ?? null,
      r.rateBp,
      r.priority,
      r.validFrom ?? null,
      r.validTo ?? null,
      r.active,
    ];
  }

  async createCommission(actor: AuthUser, r: CommissionRuleInput, reason?: string) {
    const row = await this.db.tx(async (c) => {
      const row = await this.db.one(
        `INSERT INTO commission_rules (name, driver_id, tier, vehicle_type, zone_id, campaign, rate_bp, priority, valid_from, valid_to, active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [...this.commissionParams(r), actor.id],
        c,
      );
      await this.audit.log({ actor, action: 'commission_rule.create', entityType: 'commission_rule', entityId: row.id, after: r, reason }, c);
      return row;
    });
    this.pricing.invalidateCommissionCache();
    return row;
  }

  async updateCommission(actor: AuthUser, id: string, r: CommissionRuleInput, reason?: string) {
    await this.db.tx(async (c) => {
      const before = await this.db.one('SELECT * FROM commission_rules WHERE id = $1 FOR UPDATE', [id], c);
      if (!before) throw NotFound('Commission rule');
      await this.db.query(
        `UPDATE commission_rules SET name=$1, driver_id=$2, tier=$3, vehicle_type=$4, zone_id=$5, campaign=$6, rate_bp=$7,
            priority=$8, valid_from=$9, valid_to=$10, active=$11, updated_at=now() WHERE id = $12`,
        [...this.commissionParams(r), id],
        c,
      );
      await this.audit.log({ actor, action: 'commission_rule.update', entityType: 'commission_rule', entityId: id, before, after: r, reason }, c);
    });
    this.pricing.invalidateCommissionCache();
    return { id };
  }

  async auditLogs(q: { entityType?: string; entityId?: string; actorId?: string; limit: number }) {
    return this.db.query(
      `SELECT a.*, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ($1::text IS NULL OR a.entity_type = $1) AND ($2::text IS NULL OR a.entity_id = $2)
          AND ($3::uuid IS NULL OR a.actor_id = $3)
        ORDER BY a.id DESC LIMIT $4`,
      [q.entityType ?? null, q.entityId ?? null, q.actorId ?? null, q.limit],
    );
  }

  /** Admin correction of a POD record: the original stays immutable; the amendment is stored and audited. */
  async amendPod(actor: AuthUser, podId: string, changes: Record<string, unknown>, reason: string) {
    await this.db.tx(async (c) => {
      const pod = await this.db.one('SELECT * FROM pod WHERE id = $1', [podId], c);
      if (!pod) throw NotFound('POD');
      await this.db.query('INSERT INTO pod_amendments (pod_id, amended_by, reason, changes) VALUES ($1,$2,$3,$4)', [podId, actor.id, reason, JSON.stringify(changes)], c);
      await this.audit.log({ actor, action: 'pod.amend', entityType: 'pod', entityId: podId, before: pod, after: changes, reason }, c);
    });
    return { ok: true };
  }
}
