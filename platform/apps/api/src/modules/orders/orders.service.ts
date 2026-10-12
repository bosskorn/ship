import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CreateOrderInput,
  CUSTOMER_CANCELLABLE,
  numericToSatang,
  OrderStatus,
  QuoteRequestInput,
  satangToNumeric,
} from '@ship/shared';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../common/auth';
import { FieldCipher, randomDigits } from '../../common/crypto';
import { DbService } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { QueueService } from '../../common/queue.service';
import { PAYMENT_CONFIRMED, PaymentConfirmedEvent, PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../settings/settings.service';
import { AssignmentService } from './assignment.service';
import { Actor, OnCommit, OrderStateService, SYSTEM } from './order-state.service';
import { OrderViewService } from './order-view.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DbService,
    private readonly state: OrderStateService,
    private readonly views: OrderViewService,
    private readonly payments: PaymentsService,
    private readonly assignments: AssignmentService,
    private readonly settings: SettingsService,
    private readonly queue: QueueService,
    private readonly cipher: FieldCipher,
  ) {}

  async createFromQuote(user: AuthUser, input: CreateOrderInput) {
    const existing = await this.db.one('SELECT id FROM orders WHERE customer_id = $1 AND idempotency_key = $2', [user.id, input.idempotencyKey]);
    if (existing) return { orderId: existing.id, duplicate: true, payment: await this.payments.latest(existing.id) };

    const settings = await this.settings.get();
    const result = await this.db.tx(async (c, onCommit) => {
      const q = await this.db.one('SELECT * FROM quotes WHERE id = $1 AND customer_id = $2 FOR UPDATE', [input.quoteId, user.id], c);
      if (!q) throw NotFound('Quote');
      if (q.used_at) throw new AppError('QUOTE_USED', 'ใบเสนอราคานี้ถูกใช้แล้ว', 409);
      if (!q.available) throw new AppError('QUOTE_UNAVAILABLE', 'ตัวเลือกนี้ไม่พร้อมให้บริการ', 409, { reason: q.unavailable_reason });
      if (new Date(q.expires_at) <= new Date()) throw new AppError('QUOTE_EXPIRED', 'ราคาหมดอายุ กรุณาขอราคาใหม่', 409);
      await this.db.query('UPDATE quotes SET used_at = now() WHERE id = $1', [q.id], c);

      const req = q.request as QuoteRequestInput;
      const orderNo = await this.db.one<{ no: string }>(
        `SELECT 'SH' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMMDD') || lpad(nextval('order_no_seq')::text, 6, '0') AS no`,
        [],
        c,
      );
      const serviceType = req.scheduledAt ? 'SCHEDULED' : req.dropoffs.length > 1 ? 'MULTI_STOP' : 'INSTANT';
      const order = await this.db.one(
        `INSERT INTO orders (order_no, customer_id, quote_id, idempotency_key, status, service_type, vehicle_type, zone_id,
                             scheduled_at, payment_method, cash_collect_at, price, breakdown, distance_m, duration_s, parcel, driver_gross)
         VALUES ($1,$2,$3,$4,'QUOTED',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          orderNo!.no,
          user.id,
          q.id,
          input.idempotencyKey,
          serviceType,
          q.vehicle_type,
          q.zone_id,
          req.scheduledAt ?? null,
          input.paymentMethod,
          input.cashCollectAt,
          q.price,
          JSON.stringify(q.breakdown),
          q.distance_m,
          q.duration_s,
          JSON.stringify(req.parcel),
          q.driver_gross,
        ],
        c,
      );
      await this.state.appendEvent(c, order.id, 'ORDER_CREATED', { type: 'CUSTOMER', id: user.id }, {
        quoteId: q.id,
        price: numericToSatang(q.price),
        vehicleType: q.vehicle_type,
        margin: q.margin,
      });

      await this.insertStops(c, order.id, req, q.stop_sequence);
      const p = req.parcel;
      await this.db.query(
        `INSERT INTO order_items (order_id, category, weight_kg, length_cm, width_cm, height_cm, quantity, fragile,
                                  temperature_sensitive, high_value, declared_value, note, photo_keys)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          order.id,
          p.category,
          p.weightKg,
          p.lengthCm ?? null,
          p.widthCm ?? null,
          p.heightCm ?? null,
          p.quantity ?? 1,
          p.fragile ?? false,
          p.temperatureSensitive ?? false,
          p.highValue ?? false,
          p.declaredValue !== undefined ? satangToNumeric(Math.round(p.declaredValue * 100)) : null,
          p.note ?? null,
          p.photoKeys ?? [],
        ],
        c,
      );
      if (q.promotion_id) {
        await this.db.query('UPDATE promotions SET spent = spent + $2 WHERE id = $1', [
          q.promotion_id,
          satangToNumeric(q.breakdown.promotionDiscount ?? 0),
        ], c);
      }

      const payment = await this.payments.initiate(c, order, input.paymentMethod, settings);
      const paid = payment.status === 'AUTHORIZED' || payment.status === 'CAPTURED' || input.paymentMethod === 'CASH';
      let current = order;
      if (!paid) current = await this.state.transition(c, onCommit, current, 'PAYMENT_PENDING', SYSTEM);
      else current = await this.releaseForDispatch(c, onCommit, current);
      return { orderId: order.id, orderNo: order.order_no, status: current.status as OrderStatus, payment };
    });
    return result;
  }

  private async insertStops(c: PoolClient, orderId: string, req: QuoteRequestInput, sequence: number[]) {
    const stops = [{ ...req.pickup, type: 'PICKUP' }, ...sequence.map((i) => ({ ...req.dropoffs[i], type: 'DROPOFF' }))];
    for (let seq = 0; seq < stops.length; seq++) {
      const s = stops[seq];
      await this.db.query(
        `INSERT INTO order_stops (order_id, seq, type, location, address, building, floor, room, contact_name, contact_phone, note, locked, otp_enc)
         VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          orderId,
          seq,
          s.type,
          s.location.lat,
          s.location.lng,
          s.address,
          s.building ?? null,
          s.floor ?? null,
          s.room ?? null,
          s.contactName,
          s.contactPhone,
          s.note ?? null,
          s.locked ?? false,
          this.cipher.encrypt(randomDigits(4)),
        ],
        c,
      );
    }
  }

  /** Paid (or cash) order: dispatch now, or park it as SCHEDULED with a delayed job. */
  private async releaseForDispatch(c: PoolClient, onCommit: OnCommit, order: any) {
    if (order.scheduled_at) {
      const settings = await this.settings.get();
      const at = new Date(order.scheduled_at).getTime() - settings.scheduledDispatchLeadMin * 60_000;
      const updated = await this.state.transition(c, onCommit, order, 'SCHEDULED', SYSTEM);
      onCommit(async () => {
        await this.queue.add('maintenance', 'scheduled-dispatch', { orderId: order.id }, {
          delay: Math.max(0, at - Date.now()),
          jobId: `scheduled-${order.id}`,
        });
      });
      return updated;
    }
    return this.state.transition(c, onCommit, order, 'SEARCHING_DRIVER', SYSTEM);
  }

  @OnEvent(PAYMENT_CONFIRMED, { async: true, promisify: true })
  async onPaymentConfirmed(e: PaymentConfirmedEvent) {
    await this.db.tx(async (c, onCommit) => {
      const order = await this.state.lock(c, e.orderId);
      if (order.status !== 'PAYMENT_PENDING') return;
      await this.state.appendEvent(c, order.id, 'PAYMENT_CONFIRMED', SYSTEM, { paymentId: e.paymentId });
      await this.releaseForDispatch(c, onCommit, order);
    });
  }

  async startScheduled(orderId: string) {
    await this.db.tx(async (c, onCommit) => {
      const order = await this.state.lock(c, orderId);
      if (order.status !== 'SCHEDULED') return;
      await this.state.transition(c, onCommit, order, 'SEARCHING_DRIVER', SYSTEM, { data: { reason: 'scheduled' } });
    });
  }

  async list(user: AuthUser, opts: { status?: 'active' | 'past'; limit: number; before?: string }) {
    const rows = await this.db.query(
      `SELECT o.id, o.order_no, o.status, o.vehicle_type, o.price, o.created_at, o.scheduled_at,
              (SELECT address FROM order_stops WHERE order_id = o.id AND type = 'PICKUP' LIMIT 1) AS pickup,
              (SELECT address FROM order_stops WHERE order_id = o.id ORDER BY seq DESC LIMIT 1) AS dropoff,
              (SELECT count(*) FROM order_stops WHERE order_id = o.id AND type = 'DROPOFF') AS dropoff_count
         FROM orders o
        WHERE o.customer_id = $1
          AND ($2::text IS NULL
               OR ($2 = 'active' AND o.status NOT IN ('DELIVERED','CANCELLED','FAILED','RETURNED'))
               OR ($2 = 'past' AND o.status IN ('DELIVERED','CANCELLED','FAILED','RETURNED')))
          AND ($3::timestamptz IS NULL OR o.created_at < $3)
        ORDER BY o.created_at DESC LIMIT $4`,
      [user.id, opts.status ?? null, opts.before ?? null, opts.limit],
    );
    return rows.map((r) => ({
      id: r.id,
      orderNo: r.order_no,
      status: r.status,
      vehicleType: r.vehicle_type,
      price: numericToSatang(r.price),
      createdAt: r.created_at,
      scheduledAt: r.scheduled_at,
      pickup: r.pickup,
      dropoff: r.dropoff,
      dropoffCount: Number(r.dropoff_count),
    }));
  }

  async cancel(orderId: string, actor: Actor, reason: string) {
    return this.db.tx(async (c, onCommit) => {
      const order = await this.state.lock(c, orderId);
      if (actor.type === 'CUSTOMER') {
        if (order.customer_id !== actor.id) throw NotFound('Order');
        if (!CUSTOMER_CANCELLABLE.includes(order.status))
          throw new AppError('CANNOT_CANCEL', 'ไม่สามารถยกเลิกได้หลังรับสินค้าแล้ว กรุณาติดต่อฝ่ายบริการ', 409);
      }
      await this.db.query(
        `UPDATE dispatch_offers SET status = 'CANCELLED', responded_at = now() WHERE order_id = $1 AND status = 'PENDING'`,
        [orderId],
        c,
      );
      await this.assignments.release(c, order, 'ORDER_CANCELLED', { clearOrder: false });
      await this.payments.cancelOrRefund(c, orderId);
      const updated = await this.state.transition(c, onCommit, order, 'CANCELLED', actor, {
        data: { reason },
        set: { cancel_reason: reason, cancelled_by: actor.type },
      });
      return { orderId, status: updated.status };
    });
  }

  async rate(user: AuthUser, orderId: string, input: { score: number; comment?: string; tipSatang?: number }) {
    return this.db.tx(async (c) => {
      const order = await this.state.lock(c, orderId);
      if (order.customer_id !== user.id) throw NotFound('Order');
      if (order.status !== 'DELIVERED') throw new AppError('NOT_DELIVERED', 'ให้คะแนนได้หลังส่งสำเร็จ', 409);
      const existing = await this.db.one(`SELECT 1 FROM ratings WHERE order_id = $1 AND rater_type = 'CUSTOMER'`, [orderId], c);
      if (existing) throw new AppError('ALREADY_RATED', 'ให้คะแนนออเดอร์นี้แล้ว', 409);
      await this.db.query(
        `INSERT INTO ratings (order_id, rater_type, rater_id, ratee_id, score, comment) VALUES ($1,'CUSTOMER',$2,$3,$4,$5)`,
        [orderId, user.id, order.driver_id, input.score, input.comment ?? null],
        c,
      );
      await this.db.query('UPDATE drivers SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE id = $1', [
        order.driver_id,
        input.score,
      ], c);
      if (input.tipSatang && input.tipSatang > 0) {
        // Tips are passed 100% to the driver; collected via the order's payment method in Phase 2 (wallet).
        await this.db.query(
          `INSERT INTO driver_earnings (driver_id, order_id, type, tip, net, note) VALUES ($1,$2,'TIP',$3,$3,'customer tip')`,
          [order.driver_id, orderId, satangToNumeric(input.tipSatang)],
          c,
        );
      }
      await this.state.appendEvent(c, orderId, 'RATED', { type: 'CUSTOMER', id: user.id }, { score: input.score, tip: input.tipSatang ?? 0 });
      return { ok: true };
    });
  }

  async view(user: AuthUser, orderId: string) {
    return this.views.view(orderId, user);
  }
}
