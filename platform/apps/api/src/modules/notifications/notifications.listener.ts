import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_STATUS_TH } from '@ship/shared';
import { DbService } from '../../common/db.service';
import { DomainEvent, OrderStatusChangedEvent } from '../../common/events';
import { NotificationEventName, NotificationsService } from './notifications.service';

const CUSTOMER_MESSAGES: Partial<Record<string, { event: NotificationEventName; title: string; body: (o: any) => string }>> = {
  GOING_TO_PICKUP: { event: 'DRIVER_FOUND', title: 'ได้คนขับแล้ว', body: (o) => `คนขับกำลังไปรับสินค้า ออเดอร์ ${o.order_no}` },
  ARRIVED_PICKUP: { event: 'DRIVER_ARRIVED_PICKUP', title: 'คนขับถึงจุดรับแล้ว', body: (o) => `กรุณาเตรียมสินค้า ออเดอร์ ${o.order_no}` },
  PICKED_UP: { event: 'PICKED_UP', title: 'รับสินค้าแล้ว', body: (o) => `กำลังนำส่ง ออเดอร์ ${o.order_no}` },
  ARRIVED_DESTINATION: { event: 'NEAR_DESTINATION', title: 'คนขับถึงจุดส่ง', body: (o) => `ออเดอร์ ${o.order_no}` },
  DELIVERED: { event: 'DELIVERED', title: 'ส่งสำเร็จ', body: (o) => `ออเดอร์ ${o.order_no} ส่งถึงผู้รับเรียบร้อย` },
  CANCELLED: { event: 'CANCELLED', title: 'ออเดอร์ถูกยกเลิก', body: (o) => `ออเดอร์ ${o.order_no}` },
  NO_DRIVER: { event: 'NO_DRIVER', title: 'ยังไม่พบคนขับ', body: (o) => `ทีมงานกำลังช่วยหาคนขับให้ ออเดอร์ ${o.order_no}` },
};

@Injectable()
export class NotificationsListener {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly db: DbService,
  ) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true, promisify: true })
  async onOrderStatus(e: OrderStatusChangedEvent) {
    const msg = CUSTOMER_MESSAGES[e.to];
    if (!msg) return;
    const order = await this.db.one('SELECT order_no FROM orders WHERE id = $1', [e.orderId]);
    if (!order) return;
    await this.notifications.notify({
      userId: e.customerId,
      event: msg.event,
      title: msg.title,
      body: msg.body(order),
      data: { orderId: e.orderId, status: e.to, statusText: ORDER_STATUS_TH[e.to] },
    });
  }
}
