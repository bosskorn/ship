import { Injectable } from '@nestjs/common';
import { EarningsSummary, numericToSatang, satangToNumeric } from '@ship/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService, Queryable } from '../../common/db.service';

export type Period = 'today' | 'week' | 'month';

/** Start of the period in Asia/Bangkok, as a UTC instant. Weeks start on Monday. */
export function periodStart(period: Period, now = new Date()): Date {
  const offset = 7 * 3600_000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'week') {
    const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
    local.setUTCDate(local.getUTCDate() - dow);
  } else if (period === 'month') {
    local.setUTCDate(1);
  }
  return new Date(local.getTime() - offset);
}

@Injectable()
export class EarningsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Called once when an order is DELIVERED. Amounts were locked at offer acceptance. */
  async recordTrip(c: Queryable, order: any, mileage: { deadM: number | null; loadedM: number | null }, cashCollected: number) {
    await this.db.query(
      `INSERT INTO driver_earnings (driver_id, order_id, type, gross_fare, commission, commission_rate_bp, bonus, net,
                                    cash_collected, dead_mileage_m, loaded_mileage_m)
       VALUES ($1,$2,'TRIP',$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING`,
      [
        order.driver_id,
        order.id,
        order.driver_gross,
        order.commission ?? '0',
        order.commission_rate_bp ?? 0,
        order.driver_bonus ?? '0',
        order.driver_net,
        satangToNumeric(cashCollected),
        mileage.deadM,
        mileage.loadedM,
      ],
      c,
    );
  }

  async summary(driverId: string, period: Period, now = new Date()): Promise<EarningsSummary> {
    const from = periodStart(period, now);
    const r = await this.db.one(
      `SELECT count(*) FILTER (WHERE type = 'TRIP') AS trips,
              coalesce(sum(gross_fare), 0) AS gross, coalesce(sum(commission), 0) AS commission,
              coalesce(sum(bonus), 0) AS bonus, coalesce(sum(tip), 0) AS tips, coalesce(sum(adjustment), 0) AS adjustment,
              coalesce(sum(net), 0) AS net, coalesce(sum(dead_mileage_m), 0) AS dead_m, coalesce(sum(loaded_mileage_m), 0) AS loaded_m
         FROM driver_earnings WHERE driver_id = $1 AND earned_at >= $2 AND earned_at <= $3`,
      [driverId, from, now],
    );
    const online = await this.db.one<{ s: string }>(
      `SELECT coalesce(sum(extract(epoch FROM (least(coalesce(ended_at, now()), $3) - greatest(started_at, $2)))), 0)::bigint AS s
         FROM driver_shifts WHERE driver_id = $1 AND coalesce(ended_at, now()) > $2 AND started_at < $3`,
      [driverId, from, now],
    );
    return {
      period,
      from: from.toISOString(),
      to: now.toISOString(),
      trips: Number(r.trips),
      grossFare: numericToSatang(r.gross),
      commission: numericToSatang(r.commission),
      bonus: numericToSatang(r.bonus),
      tips: numericToSatang(r.tips),
      adjustment: numericToSatang(r.adjustment),
      netEarnings: numericToSatang(r.net),
      onlineSeconds: Number(online?.s ?? 0),
      deadMileageM: Number(r.dead_m),
      loadedMileageM: Number(r.loaded_m),
    };
  }

  async items(driverId: string, limit = 50, before?: string) {
    const rows = await this.db.query(
      `SELECT e.id, e.type, e.order_id, o.order_no, e.gross_fare, e.commission, e.commission_rate_bp, e.bonus, e.tip,
              e.adjustment, e.net, e.cash_collected, e.dead_mileage_m, e.loaded_mileage_m, e.earned_at, e.note
         FROM driver_earnings e LEFT JOIN orders o ON o.id = e.order_id
        WHERE e.driver_id = $1 AND ($2::timestamptz IS NULL OR e.earned_at < $2)
        ORDER BY e.earned_at DESC LIMIT $3`,
      [driverId, before ?? null, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      orderId: r.order_id,
      orderNo: r.order_no,
      grossFare: numericToSatang(r.gross_fare),
      commission: numericToSatang(r.commission),
      commissionRateBp: r.commission_rate_bp,
      bonus: numericToSatang(r.bonus),
      tip: numericToSatang(r.tip),
      adjustment: numericToSatang(r.adjustment),
      net: numericToSatang(r.net),
      cashCollected: numericToSatang(r.cash_collected),
      deadMileageM: r.dead_mileage_m,
      loadedMileageM: r.loaded_mileage_m,
      earnedAt: r.earned_at,
      note: r.note,
    }));
  }

  /** Ops adjustment (positive or negative), always audited. */
  async adjust(actor: AuthUser, driverId: string, amountSatang: number, reason: string, orderId?: string) {
    await this.db.tx(async (c) => {
      const row = await this.db.one(
        `INSERT INTO driver_earnings (driver_id, order_id, type, adjustment, net, note, created_by)
         VALUES ($1,$2,'ADJUSTMENT',$3,$3,$4,$5) RETURNING id`,
        [driverId, orderId ?? null, satangToNumeric(amountSatang), reason, actor.id],
        c,
      );
      await this.audit.log({ actor, action: 'earnings.adjust', entityType: 'driver_earnings', entityId: row.id, after: { driverId, amountSatang, orderId }, reason }, c);
    });
  }
}
