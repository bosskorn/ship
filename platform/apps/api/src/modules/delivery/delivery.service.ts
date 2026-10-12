import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ACTIVE_DRIVER_STATUSES, haversineMeters, LatLng, numericToSatang, StopEvidence } from '@ship/shared';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../common/auth';
import { FieldCipher, safeEqual } from '../../common/crypto';
import { DbService } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { DomainEvent, OpsAlertEvent } from '../../common/events';
import { EarningsService } from '../earnings/earnings.service';
import { AssignmentService } from '../orders/assignment.service';
import { Actor, OnCommit, OrderStateService, SYSTEM } from '../orders/order-state.service';
import { OrderViewService, STOP_COLUMNS } from '../orders/order-view.service';
import { PaymentsService } from '../payments/payments.service';
import { RiskService } from '../risk/risk.service';
import { SettingsService } from '../settings/settings.service';
import { TrackingService } from '../tracking/tracking.service';

/** Driver cancellations in 24 h that trigger a risk review. */
const CANCEL_RISK_THRESHOLD = 3;

/**
 * Driver-side delivery workflow (spec §14–16). The driver app sends intents with evidence;
 * every state change is validated here: ownership, current status, stop order, geofence,
 * OTP/QR/photo verification. POD rows are append-only.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly db: DbService,
    private readonly state: OrderStateService,
    private readonly views: OrderViewService,
    private readonly assignments: AssignmentService,
    private readonly payments: PaymentsService,
    private readonly earnings: EarningsService,
    private readonly tracking: TrackingService,
    private readonly settings: SettingsService,
    private readonly risk: RiskService,
    private readonly cipher: FieldCipher,
    private readonly events: EventEmitter2,
  ) {}

  private actor(driver: AuthUser): Actor {
    return { type: 'DRIVER', id: driver.id };
  }

  private async lockOwned(c: PoolClient, driver: AuthUser, orderId: string) {
    const order = await this.state.lock(c, orderId);
    if (order.driver_id !== driver.id) throw NotFound('Order');
    return order;
  }

  private async lockStop(c: PoolClient, orderId: string, stopId: string) {
    const s = await this.db.one(`SELECT ${STOP_COLUMNS} FROM order_stops s WHERE s.id = $1 AND s.order_id = $2 FOR UPDATE`, [stopId, orderId], c);
    if (!s) throw NotFound('Stop');
    return { ...s, location: { lat: Number(s.lat), lng: Number(s.lng) } as LatLng };
  }

  /**
   * Geofence check. Outside the fence the driver must give a reason; that is allowed
   * (GPS drift in sois/condos is real) but logged as a risk signal and surfaced to ops.
   */
  private async checkGeofence(
    c: PoolClient,
    onCommit: OnCommit,
    ctx: { driverId: string; orderId: string; orderNo: string; step: string },
    at: LatLng,
    target: LatLng,
    limitM: number,
    overrideReason?: string,
  ): Promise<number> {
    const distance = Math.round(haversineMeters(at, target));
    if (distance <= limitM) return distance;
    if (!overrideReason) {
      throw new AppError('OUTSIDE_GEOFENCE', `คุณอยู่ห่างจากจุดหมาย ${distance} ม. กรุณาระบุเหตุผล`, 422, { distanceM: distance, limitM });
    }
    await this.risk.record(
      { type: 'GEOFENCE_OVERRIDE', userId: ctx.driverId, orderId: ctx.orderId, score: distance > limitM * 5 ? 40 : 15, details: { step: ctx.step, distanceM: distance, limitM, reason: overrideReason } },
      c,
    );
    const alert: OpsAlertEvent = {
      kind: 'GEOFENCE_OVERRIDE',
      orderId: ctx.orderId,
      driverId: ctx.driverId,
      message: `${ctx.orderNo}: ${ctx.step} ห่าง ${distance} ม. (${overrideReason})`,
      at: new Date().toISOString(),
    };
    onCommit(() => void this.events.emit(DomainEvent.OPS_ALERT, alert));
    return distance;
  }

  private verifyCode(stop: any, order: any, evidence: StopEvidence) {
    const otp = this.cipher.decrypt(stop.otp_enc);
    const otpOk = !!(evidence.otp && otp && safeEqual(evidence.otp, otp));
    // QR shown in the customer/recipient app encodes "<orderNo>:<otp>"
    const qrOk = !!(evidence.qrPayload && otp && safeEqual(evidence.qrPayload, `${order.order_no}:${otp}`));
    if (evidence.otp && !otpOk) throw new AppError('OTP_MISMATCH', 'รหัสยืนยันไม่ถูกต้อง', 422);
    if (evidence.qrPayload && !qrOk) throw new AppError('QR_MISMATCH', 'QR ไม่ถูกต้อง', 422);
    return { otpOk, qrOk };
  }

  private async insertPod(
    c: PoolClient,
    order: any,
    stop: any,
    kind: 'PICKUP' | 'DROPOFF',
    evidence: StopEvidence,
    verified: { otpOk: boolean; qrOk: boolean },
    distance: number,
    driverId: string,
  ) {
    await this.db.query(
      `INSERT INTO pod (order_id, stop_id, kind, otp_verified, qr_verified, photo_keys, signature_key, recipient_name, location,
                        distance_from_stop_m, override_reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($10, $9), 4326)::geography, $11,$12,$13)`,
      [
        order.id,
        stop.id,
        kind,
        verified.otpOk,
        verified.qrOk,
        evidence.photoKeys ?? [],
        evidence.signatureKey ?? null,
        evidence.recipientName ?? null,
        evidence.location.lat,
        evidence.location.lng,
        distance,
        evidence.overrideReason ?? null,
        driverId,
      ],
      c,
    );
  }

  // ------------------------------------------------------------------ queries

  async activeOrder(driver: AuthUser) {
    const o = await this.db.one(
      `SELECT id FROM orders WHERE driver_id = $1 AND status = ANY($2) ORDER BY assigned_at DESC LIMIT 1`,
      [driver.id, ACTIVE_DRIVER_STATUSES],
    );
    if (!o) return null;
    const view = await this.views.view(o.id, driver);
    const order = await this.db.one('SELECT payment_method, cash_collect_at, price, driver_net, driver_gross, commission, driver_bonus FROM orders WHERE id = $1', [o.id]);
    return {
      ...view,
      earnings: {
        gross: numericToSatang(order.driver_gross),
        commission: numericToSatang(order.commission),
        bonus: numericToSatang(order.driver_bonus),
        net: numericToSatang(order.driver_net),
      },
      cash: order.payment_method === 'CASH' ? { amount: numericToSatang(order.price), collectAt: order.cash_collect_at } : null,
    };
  }

  async history(driver: AuthUser, limit = 30) {
    return this.db.query(
      `SELECT o.id, o.order_no, o.status, o.vehicle_type, o.driver_net, o.delivered_at, o.created_at,
              (SELECT address FROM order_stops WHERE order_id = o.id AND type = 'PICKUP' LIMIT 1) AS pickup,
              (SELECT address FROM order_stops WHERE order_id = o.id ORDER BY seq DESC LIMIT 1) AS dropoff
         FROM orders o WHERE o.driver_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
      [driver.id, limit],
    );
  }

  // ------------------------------------------------------------------ pickup

  async arrivePickup(driver: AuthUser, orderId: string, input: { location: LatLng; overrideReason?: string }) {
    const settings = await this.settings.get();
    return this.db.tx(async (c, onCommit) => {
      const order = await this.lockOwned(c, driver, orderId);
      if (order.status !== 'GOING_TO_PICKUP') throw new AppError('INVALID_STATE', `Order is ${order.status}`, 409);
      const stopRow = await this.db.one(`SELECT id FROM order_stops WHERE order_id = $1 AND type = 'PICKUP'`, [orderId], c);
      const stop = await this.lockStop(c, orderId, stopRow.id);
      const distance = await this.checkGeofence(
        c,
        onCommit,
        { driverId: driver.id, orderId, orderNo: order.order_no, step: 'ARRIVED_PICKUP' },
        input.location,
        stop.location,
        settings.pickupGeofenceM,
        input.overrideReason,
      );
      await this.db.query(`UPDATE order_stops SET status = 'ARRIVED', arrived_at = now() WHERE id = $1`, [stop.id], c);
      const updated = await this.state.transition(c, onCommit, order, 'ARRIVED_PICKUP', this.actor(driver), {
        location: input.location,
        data: { distanceM: distance, overrideReason: input.overrideReason ?? null },
      });
      return { status: updated.status };
    });
  }

  async confirmPickup(driver: AuthUser, orderId: string, evidence: StopEvidence) {
    const settings = await this.settings.get();
    return this.db.tx(async (c, onCommit) => {
      const order = await this.lockOwned(c, driver, orderId);
      if (order.status !== 'ARRIVED_PICKUP') throw new AppError('INVALID_STATE', `Order is ${order.status}`, 409);
      const stopRow = await this.db.one(`SELECT id FROM order_stops WHERE order_id = $1 AND type = 'PICKUP'`, [orderId], c);
      const stop = await this.lockStop(c, orderId, stopRow.id);

      const verified = this.verifyCode(stop, order, evidence);
      if (!verified.otpOk && !verified.qrOk && !(evidence.photoKeys?.length)) {
        throw new AppError('PICKUP_EVIDENCE_REQUIRED', 'กรุณากรอกรหัสรับสินค้า สแกน QR หรือถ่ายรูปสินค้า', 422);
      }
      const distance = await this.checkGeofence(
        c,
        onCommit,
        { driverId: driver.id, orderId, orderNo: order.order_no, step: 'PICKED_UP' },
        evidence.location,
        stop.location,
        settings.pickupGeofenceM,
        evidence.overrideReason,
      );
      await this.insertPod(c, order, stop, 'PICKUP', evidence, verified, distance, driver.id);
      await this.db.query(`UPDATE order_stops SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [stop.id], c);

      // Dead mileage actually driven (assignment -> pickup), from GPS history.
      const assignment = await this.db.one(
        `SELECT id, assigned_at FROM assignments WHERE order_id = $1 AND ended_at IS NULL`,
        [orderId],
        c,
      );
      if (assignment) {
        const dead = await this.tracking.drivenMeters(driver.id, assignment.assigned_at, new Date());
        await this.db.query('UPDATE assignments SET actual_dead_mileage_m = $2 WHERE id = $1', [assignment.id, dead], c);
      }

      const picked = await this.state.transition(c, onCommit, order, 'PICKED_UP', this.actor(driver), {
        location: evidence.location,
        data: { otpVerified: verified.otpOk, qrVerified: verified.qrOk, photos: evidence.photoKeys?.length ?? 0, distanceM: distance },
      });
      if (order.payment_method === 'CASH' && order.cash_collect_at === 'PICKUP') await this.payments.capture(c, orderId);
      const transit = await this.state.transition(c, onCommit, picked, 'IN_TRANSIT', SYSTEM);
      return { status: transit.status };
    });
  }

  // ------------------------------------------------------------------ drop-offs

  async arriveStop(driver: AuthUser, orderId: string, stopId: string, input: { location: LatLng; overrideReason?: string }) {
    const settings = await this.settings.get();
    return this.db.tx(async (c, onCommit) => {
      const order = await this.lockOwned(c, driver, orderId);
      if (order.status !== 'IN_TRANSIT') throw new AppError('INVALID_STATE', `Order is ${order.status}`, 409);
      const next = await this.db.one(
        `SELECT id FROM order_stops WHERE order_id = $1 AND type = 'DROPOFF' AND status = 'PENDING' ORDER BY seq LIMIT 1`,
        [orderId],
        c,
      );
      if (!next || next.id !== stopId) throw new AppError('WRONG_STOP', 'กรุณาส่งตามลำดับจุดส่ง', 409, { expectedStopId: next?.id });
      const stop = await this.lockStop(c, orderId, stopId);
      const distance = await this.checkGeofence(
        c,
        onCommit,
        { driverId: driver.id, orderId, orderNo: order.order_no, step: `ARRIVED_STOP_${stop.seq}` },
        input.location,
        stop.location,
        settings.dropoffGeofenceM,
        input.overrideReason,
      );
      await this.db.query(`UPDATE order_stops SET status = 'ARRIVED', arrived_at = now() WHERE id = $1`, [stopId], c);
      const updated = await this.state.transition(c, onCommit, order, 'ARRIVED_DESTINATION', this.actor(driver), {
        location: input.location,
        data: { stopId, seq: stop.seq, distanceM: distance, overrideReason: input.overrideReason ?? null },
      });
      return { status: updated.status };
    });
  }

  async completeStop(driver: AuthUser, orderId: string, stopId: string, evidence: StopEvidence) {
    const settings = await this.settings.get();
    return this.db.tx(async (c, onCommit) => {
      const order = await this.lockOwned(c, driver, orderId);
      if (order.status !== 'ARRIVED_DESTINATION') throw new AppError('INVALID_STATE', `Order is ${order.status}`, 409);
      const stop = await this.lockStop(c, orderId, stopId);
      if (stop.status !== 'ARRIVED') throw new AppError('WRONG_STOP', 'ยังไม่ได้แจ้งถึงจุดส่งนี้', 409);

      const verified = this.verifyCode(stop, order, evidence);
      const photoProof = (evidence.photoKeys?.length ?? 0) > 0 && !!evidence.recipientName;
      if (!verified.otpOk && !verified.qrOk && !photoProof) {
        throw new AppError('POD_REQUIRED', 'กรุณากรอกรหัสจากผู้รับ หรือถ่ายรูปพร้อมชื่อผู้รับ', 422);
      }
      const distance = await this.checkGeofence(
        c,
        onCommit,
        { driverId: driver.id, orderId, orderNo: order.order_no, step: `POD_STOP_${stop.seq}` },
        evidence.location,
        stop.location,
        settings.dropoffGeofenceM,
        evidence.overrideReason,
      );
      await this.insertPod(c, order, stop, 'DROPOFF', evidence, verified, distance, driver.id);
      await this.db.query(`UPDATE order_stops SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [stopId], c);

      const remaining = await this.db.one<{ n: string }>(
        `SELECT count(*) AS n FROM order_stops WHERE order_id = $1 AND type = 'DROPOFF' AND status <> 'COMPLETED'`,
        [orderId],
        c,
      );
      if (Number(remaining!.n) > 0) {
        const updated = await this.state.transition(c, onCommit, order, 'IN_TRANSIT', this.actor(driver), {
          location: evidence.location,
          data: { completedStopId: stopId, remaining: Number(remaining!.n) },
        });
        return { status: updated.status, remainingStops: Number(remaining!.n) };
      }
      const delivered = await this.state.transition(c, onCommit, order, 'DELIVERED', this.actor(driver), {
        location: evidence.location,
        data: { stopId, otpVerified: verified.otpOk, photos: evidence.photoKeys?.length ?? 0, recipientName: evidence.recipientName ?? null },
      });
      await this.finalize(c, delivered);
      return { status: delivered.status, remainingStops: 0 };
    });
  }

  /** Delivered: capture payment, book driver earnings, free the driver. */
  private async finalize(c: PoolClient, order: any) {
    const payment = await this.payments.capture(c, order.id);
    const cashCollected = order.payment_method === 'CASH' && payment?.status === 'CAPTURED' ? numericToSatang(order.price) : 0;
    const assignment = await this.db.one(
      `SELECT id, actual_dead_mileage_m, planned_dead_mileage_m FROM assignments WHERE order_id = $1 AND ended_at IS NULL`,
      [order.id],
      c,
    );
    const loaded = order.picked_up_at ? await this.tracking.drivenMeters(order.driver_id, order.picked_up_at, new Date()) : null;
    if (assignment) await this.db.query('UPDATE assignments SET loaded_mileage_m = $2 WHERE id = $1', [assignment.id, loaded], c);
    await this.earnings.recordTrip(
      c,
      order,
      { deadM: assignment?.actual_dead_mileage_m ?? assignment?.planned_dead_mileage_m ?? null, loadedM: loaded },
      cashCollected,
    );
    await this.db.query('UPDATE drivers SET trips_completed = trips_completed + 1 WHERE id = $1', [order.driver_id], c);
    await this.assignments.release(c, order, 'COMPLETED', { clearOrder: false });
  }

  // ------------------------------------------------------------------ driver cancellation

  async driverCancel(driver: AuthUser, orderId: string, reason: string) {
    const outcome = await this.db.tx(async (c, onCommit) => {
      const order = await this.lockOwned(c, driver, orderId);
      if (!['DRIVER_ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_PICKUP'].includes(order.status)) {
        throw new AppError('CANNOT_CANCEL', 'ยกเลิกได้เฉพาะก่อนรับสินค้า กรุณาติดต่อฝ่ายปฏิบัติการ', 409);
      }
      await this.db.query(`UPDATE order_stops SET status = 'PENDING', arrived_at = NULL WHERE order_id = $1 AND type = 'PICKUP'`, [orderId], c);
      await this.assignments.release(c, order, `DRIVER_CANCELLED: ${reason}`, { clearOrder: true });
      await this.db.query('UPDATE drivers SET trips_cancelled = trips_cancelled + 1 WHERE id = $1', [driver.id], c);
      const fresh = await this.state.lock(c, orderId);
      const updated = await this.state.transition(c, onCommit, fresh, 'SEARCHING_DRIVER', this.actor(driver), { data: { reason, cancelledDriverId: driver.id } });
      const recent = await this.db.one<{ n: string }>(
        `SELECT count(*) AS n FROM tracking_events
          WHERE actor_id = $1 AND actor_type = 'DRIVER' AND to_status = 'SEARCHING_DRIVER' AND created_at > now() - interval '24 hours'`,
        [driver.id],
        c,
      );
      if (Number(recent!.n) >= CANCEL_RISK_THRESHOLD) {
        await this.risk.record({ type: 'REPEATED_CANCELLATION', userId: driver.id, orderId, score: 25, details: { last24h: Number(recent!.n), reason } }, c);
      }
      return { status: updated.status };
    });
    return outcome;
  }
}
