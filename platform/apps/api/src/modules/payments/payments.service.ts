import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { numericToSatang, PaymentMethod, PlatformSettings, satangToNumeric } from '@ship/shared';
import { applyBasisPoints } from '@ship/shared';
import { DbService, Queryable } from '../../common/db.service';
import { AppError } from '../../common/errors';
import { PAYMENT_ADAPTERS, PaymentAdapter } from './payment.adapters';

export const PAYMENT_CONFIRMED = 'payment.confirmed';
export const PAYMENT_FAILED = 'payment.failed';

export interface PaymentConfirmedEvent {
  orderId: string;
  paymentId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DbService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_ADAPTERS) private readonly adapters: PaymentAdapter[],
  ) {}

  private adapterFor(method: PaymentMethod): PaymentAdapter {
    const a = this.adapters.find((x) => x.methods.includes(method));
    if (!a) throw new AppError('PAYMENT_METHOD_UNAVAILABLE', `Payment method ${method} is not available`, 422);
    return a;
  }

  private byProvider(provider: string): PaymentAdapter {
    const a = this.adapters.find((x) => x.provider === provider);
    if (!a) throw new AppError('NOT_FOUND', 'Unknown payment provider', 404);
    return a;
  }

  async initiate(
    c: Queryable,
    order: { id: string; order_no: string; price: string },
    method: PaymentMethod,
    settings: PlatformSettings,
  ) {
    const adapter = this.adapterFor(method);
    const amount = numericToSatang(order.price);
    const fee = applyBasisPoints(amount, (settings.paymentFeeBp as Record<string, number>)[method] ?? 0);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO payments (order_id, method, provider, status, amount, fee) VALUES ($1,$2,$3,'PENDING',$4,$5) RETURNING id`,
      [order.id, method, adapter.provider, satangToNumeric(amount), satangToNumeric(fee)],
      c,
    );
    const res = await adapter.initiate({ paymentId: row!.id, orderNo: order.order_no, amount });
    await this.db.query(
      `UPDATE payments SET status = $2, provider_ref = $3, client_data = $4, updated_at = now() WHERE id = $1`,
      [row!.id, res.status, res.providerRef, JSON.stringify(res.clientData)],
      c,
    );
    return { paymentId: row!.id, status: res.status, clientData: res.clientData };
  }

  /** Mark captured (cash collected by the driver, or card captured on delivery). */
  async capture(c: Queryable, orderId: string) {
    const p = await this.db.one('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [orderId], c);
    if (!p || p.status === 'CAPTURED') return p;
    const ok = await this.byProvider(p.provider).capture({ providerRef: p.provider_ref, amount: numericToSatang(p.amount) });
    await this.db.query(`UPDATE payments SET status = $2, updated_at = now() WHERE id = $1`, [p.id, ok.ok ? 'CAPTURED' : 'FAILED'], c);
    return { ...p, status: ok.ok ? 'CAPTURED' : 'FAILED' };
  }

  async cancelOrRefund(c: Queryable, orderId: string) {
    const p = await this.db.one('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [orderId], c);
    if (!p) return;
    if (p.status === 'CAPTURED') {
      await this.byProvider(p.provider).refund({ providerRef: p.provider_ref, amount: numericToSatang(p.amount) });
      await this.db.query(`UPDATE payments SET status = 'REFUNDED', updated_at = now() WHERE id = $1`, [p.id], c);
    } else if (p.status === 'PENDING' || p.status === 'AUTHORIZED') {
      await this.db.query(`UPDATE payments SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [p.id], c);
    }
  }

  async latest(orderId: string) {
    return this.db.one(
      'SELECT id, method, provider, status, amount, client_data, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId],
    );
  }

  async handleWebhook(provider: string, headers: Record<string, any>, body: any) {
    const adapter = this.byProvider(provider);
    const parsed = await adapter.parseWebhook(headers, body);
    if (!parsed) throw new AppError('WEBHOOK_INVALID', 'Invalid webhook', 400);
    const p = await this.db.one('SELECT * FROM payments WHERE provider = $1 AND provider_ref = $2', [provider, parsed.providerRef]);
    if (!p) throw new AppError('NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'CAPTURED' || p.status === 'AUTHORIZED') return { ok: true, duplicate: true };
    await this.db.query(`UPDATE payments SET status = $2, raw = $3, updated_at = now() WHERE id = $1`, [p.id, parsed.status, JSON.stringify(parsed.raw)]);
    const evt: PaymentConfirmedEvent = { orderId: p.order_id, paymentId: p.id };
    if (parsed.status === 'FAILED') this.events.emit(PAYMENT_FAILED, evt);
    else await this.events.emitAsync(PAYMENT_CONFIRMED, evt);
    return { ok: true };
  }
}
