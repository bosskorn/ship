import type { ActorType, OrderStatus } from '@ship/shared';

/** In-process domain events (EventEmitter2). Emitted after the DB transaction commits. */
export const DomainEvent = {
  ORDER_STATUS_CHANGED: 'order.status_changed',
  OFFER_CREATED: 'dispatch.offer_created',
  OFFER_REVOKED: 'dispatch.offer_revoked',
  OPS_ALERT: 'ops.alert',
  DRIVER_LOCATION: 'driver.location',
  DRIVER_PRESENCE: 'driver.presence',
} as const;

export interface OrderStatusChangedEvent {
  orderId: string;
  customerId: string;
  driverId: string | null;
  from: OrderStatus | null;
  to: OrderStatus;
  actorType: ActorType;
  actorId: string | null;
  at: string;
}

export interface OpsAlertEvent {
  kind: 'NO_DRIVER' | 'LATE_PICKUP' | 'LATE_DELIVERY' | 'RISK' | 'GEOFENCE_OVERRIDE' | 'PAYMENT_FAILED';
  orderId?: string;
  driverId?: string;
  message: string;
  at: string;
}
