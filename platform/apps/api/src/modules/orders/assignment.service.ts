import { Injectable } from '@nestjs/common';
import { numericToSatang, satangToNumeric, WsEvent } from '@ship/shared';
import type { PoolClient } from 'pg';
import { DbService } from '../../common/db.service';
import { AppError } from '../../common/errors';
import { computeMargin } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { Actor, OnCommit, OrderStateService, SYSTEM } from './order-state.service';

export interface OfferTerms {
  gross: number;
  commissionRateBp: number;
  commission: number;
  bonus: number;
  net: number;
}

@Injectable()
export class AssignmentService {
  constructor(
    private readonly db: DbService,
    private readonly state: OrderStateService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Driver earnings for an order, locked at offer/assignment time (spec §13). */
  async termsFor(order: any, driver: { id: string; tier: string }, bonus = 0): Promise<OfferTerms> {
    const gross = numericToSatang(order.driver_gross);
    const { rateBp } = await this.pricing.resolveCommissionBp({
      driverId: driver.id,
      tier: driver.tier,
      vehicleType: order.vehicle_type,
      zoneId: order.zone_id,
      at: new Date(),
    });
    const m = computeMargin({
      customerPayment: numericToSatang(order.price),
      subtotal: numericToSatang(order.price),
      driverGross: gross,
      tollParking: order.breakdown?.tollParking ?? 0,
      commissionBp: rateBp,
      driverIncentive: bonus,
      paymentFeeBp: 0,
      insuranceRiskBp: 0,
      otherVariableCost: 0,
    });
    return { gross, commissionRateBp: rateBp, commission: m.commission, bonus, net: m.driverNet };
  }

  async assign(
    c: PoolClient,
    onCommit: OnCommit,
    order: any,
    input: { driverId: string; method: 'AUTO' | 'MANUAL'; actor: Actor; offerId?: string; terms?: OfferTerms; reason?: string },
  ) {
    const driver = await this.db.one(
      `SELECT d.*, ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng,
              ST_Distance(l.location, (SELECT location FROM order_stops WHERE order_id = $2 AND type = 'PICKUP' LIMIT 1)) AS dist_to_pickup
         FROM drivers d LEFT JOIN driver_locations l ON l.driver_id = d.id
        WHERE d.id = $1 FOR UPDATE OF d`,
      [input.driverId, order.id],
      c,
    );
    if (!driver) throw new AppError('NOT_FOUND', 'Driver not found', 404);
    if (driver.kyc_status !== 'APPROVED') throw new AppError('DRIVER_NOT_APPROVED', 'Driver is not approved', 409);
    if (driver.presence !== 'ONLINE') throw new AppError('DRIVER_NOT_AVAILABLE', 'Driver is offline or busy', 409);
    const vehicle = await this.db.one('SELECT * FROM vehicles WHERE id = $1', [driver.current_vehicle_id], c);
    if (!vehicle || vehicle.type !== order.vehicle_type || vehicle.status !== 'APPROVED')
      throw new AppError('VEHICLE_MISMATCH', 'Driver vehicle does not match the order', 409);

    const terms = input.terms ?? (await this.termsFor(order, driver));
    const settings = await this.settings.get();
    const margin = computeMargin({
      customerPayment: numericToSatang(order.price),
      subtotal: numericToSatang(order.price) + (order.breakdown?.promotionDiscount ?? 0),
      driverGross: terms.gross,
      tollParking: order.breakdown?.tollParking ?? 0,
      commissionBp: terms.commissionRateBp,
      driverIncentive: terms.bonus,
      paymentFeeBp: this.pricing.paymentFeeBp(order.payment_method, settings),
      insuranceRiskBp: settings.insuranceRiskBp,
      otherVariableCost: settings.otherVariableCostSatang,
    });

    const deadMileage = driver.dist_to_pickup !== null ? Math.round(Number(driver.dist_to_pickup)) : null;
    await this.db.query(
      `INSERT INTO assignments (order_id, driver_id, vehicle_id, offer_id, method, assigned_by, reason, assigned_location, planned_dead_mileage_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography END, $10)`,
      [order.id, driver.id, vehicle.id, input.offerId ?? null, input.method, input.actor.id, input.reason ?? null, driver.lat, driver.lng, deadMileage],
      c,
    );
    await this.db.query(`UPDATE drivers SET presence = 'BUSY', presence_changed_at = now() WHERE id = $1`, [driver.id], c);

    const assigned = await this.state.transition(c, onCommit, order, 'DRIVER_ASSIGNED', input.actor, {
      data: { driverId: driver.id, method: input.method, offerId: input.offerId ?? null, reason: input.reason ?? null, plannedDeadMileageM: deadMileage },
      set: {
        driver_id: driver.id,
        vehicle_id: vehicle.id,
        commission_rate_bp: terms.commissionRateBp,
        commission: satangToNumeric(terms.commission),
        driver_bonus: satangToNumeric(terms.bonus),
        driver_net: satangToNumeric(terms.net),
        contribution_margin: satangToNumeric(margin.contributionMargin),
        margin: JSON.stringify(margin),
      },
    });
    const going = await this.state.transition(c, onCommit, assigned, 'GOING_TO_PICKUP', SYSTEM);

    // Revoke offers still pending for other drivers.
    const revoked = await this.db.query<{ id: string; driver_id: string }>(
      `UPDATE dispatch_offers SET status = 'CANCELLED', responded_at = now()
        WHERE order_id = $1 AND status = 'PENDING' AND driver_id <> $2 RETURNING id, driver_id`,
      [order.id, driver.id],
      c,
    );
    onCommit(() => {
      for (const r of revoked) this.realtime.toUser(r.driver_id, WsEvent.OFFER_REVOKED, { offerId: r.id, orderId: order.id, reason: 'TAKEN' });
    });
    return going;
  }

  /** Detach the current driver (driver/ops cancellation before pickup, or completion). */
  async release(c: PoolClient, order: any, reason: string, opts: { clearOrder: boolean }) {
    if (!order.driver_id) return;
    await this.db.query(
      `UPDATE assignments SET ended_at = now(), end_reason = $2 WHERE order_id = $1 AND ended_at IS NULL`,
      [order.id, reason],
      c,
    );
    await this.db.query(
      `UPDATE drivers SET presence = 'ONLINE', presence_changed_at = now() WHERE id = $1 AND presence = 'BUSY'`,
      [order.driver_id],
      c,
    );
    if (opts.clearOrder) {
      await this.db.query(
        `UPDATE orders SET driver_id = NULL, vehicle_id = NULL, commission_rate_bp = NULL, commission = NULL,
                driver_net = NULL, driver_bonus = 0, contribution_margin = NULL, margin = NULL WHERE id = $1`,
        [order.id],
        c,
      );
    }
  }
}
