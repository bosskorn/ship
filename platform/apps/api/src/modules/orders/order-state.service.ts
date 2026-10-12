import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, assertTransition, LatLng, OrderStatus } from '@ship/shared';
import type { PoolClient } from 'pg';
import { DbService, Queryable } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { DomainEvent, OrderStatusChangedEvent } from '../../common/events';
import { MetricsService } from '../../common/metrics.service';

export interface Actor {
  type: ActorType;
  id: string | null;
}

export const SYSTEM: Actor = { type: 'SYSTEM', id: null };

export type OnCommit = (cb: () => void | Promise<void>) => void;

/** Timestamp column stamped when an order enters a status. */
const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  SEARCHING_DRIVER: 'dispatch_started_at',
  DRIVER_ASSIGNED: 'assigned_at',
  PICKED_UP: 'picked_up_at',
  DELIVERED: 'delivered_at',
  CANCELLED: 'cancelled_at',
};

/**
 * The only place order.status is written. Every transition is validated against the
 * shared state machine, versioned, and recorded in tracking_events (append-only).
 */
@Injectable()
export class OrderStateService {
  constructor(
    private readonly db: DbService,
    private readonly events: EventEmitter2,
    private readonly metrics: MetricsService,
  ) {}

  async lock(c: PoolClient, orderId: string): Promise<any> {
    const order = await this.db.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], c);
    if (!order) throw NotFound('Order');
    return order;
  }

  async transition(
    c: PoolClient,
    onCommit: OnCommit,
    order: any,
    to: OrderStatus,
    actor: Actor,
    opts: { data?: Record<string, unknown>; location?: LatLng | null; set?: Record<string, unknown> } = {},
  ): Promise<any> {
    const from = order.status as OrderStatus;
    assertTransition(from, to, actor.type);

    const sets = ['status = $2', 'version = version + 1', 'updated_at = now()'];
    const params: unknown[] = [order.id, to];
    const ts = STATUS_TIMESTAMP[to];
    if (ts) sets.push(`${ts} = coalesce(${ts}, now())`);
    for (const [col, val] of Object.entries(opts.set ?? {})) {
      if (!/^[a-z_]+$/.test(col)) throw new Error(`bad column ${col}`);
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
    const updated = await this.db.one(`UPDATE orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params, c);

    await this.appendEvent(c, order.id, 'STATUS_CHANGED', actor, opts.data ?? {}, opts.location ?? null, { from, to });

    const evt: OrderStatusChangedEvent = {
      orderId: order.id,
      customerId: order.customer_id,
      driverId: updated.driver_id,
      from,
      to,
      actorType: actor.type,
      actorId: actor.id,
      at: new Date().toISOString(),
    };
    onCommit(() => {
      this.metrics.orderTransitions.inc({ to });
      this.events.emit(DomainEvent.ORDER_STATUS_CHANGED, evt);
    });
    return updated;
  }

  async appendEvent(
    c: Queryable,
    orderId: string,
    type: string,
    actor: Actor,
    data: Record<string, unknown> = {},
    location: LatLng | null = null,
    status?: { from: OrderStatus | null; to: OrderStatus | null },
  ) {
    await this.db.query(
      `INSERT INTO tracking_events (order_id, type, from_status, to_status, actor_type, actor_id, location, data)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography END, $9)`,
      [
        orderId,
        type,
        status?.from ?? null,
        status?.to ?? null,
        actor.type,
        actor.id,
        location?.lat ?? null,
        location?.lng ?? null,
        JSON.stringify(data),
      ],
      c,
    );
  }
}
