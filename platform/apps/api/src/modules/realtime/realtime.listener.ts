import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsEvent } from '@ship/shared';
import { DomainEvent, OpsAlertEvent, OrderStatusChangedEvent } from '../../common/events';
import { OrderViewService } from '../orders/order-view.service';
import { RealtimeService } from './realtime.service';

/** Fans domain events out to sockets (customer, driver, ops rooms). */
@Injectable()
export class RealtimeListener {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly views: OrderViewService,
  ) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true, promisify: true })
  async onOrderStatus(e: OrderStatusChangedEvent) {
    const driver = e.driverId ? await this.views.driverPublic(e.driverId) : null;
    const payload = { orderId: e.orderId, status: e.to, at: e.at, driver };
    const rooms = [`order:${e.orderId}`, `user:${e.customerId}`];
    if (e.driverId) rooms.push(`user:${e.driverId}`);
    this.realtime.toRooms(rooms, WsEvent.ORDER_UPDATED, payload);
    this.realtime.toOps(WsEvent.OPS_ORDER_UPDATED, { ...payload, from: e.from, actorType: e.actorType });
  }

  @OnEvent(DomainEvent.OPS_ALERT)
  onOpsAlert(e: OpsAlertEvent) {
    this.realtime.toOps(WsEvent.OPS_ALERT, e);
  }
}
