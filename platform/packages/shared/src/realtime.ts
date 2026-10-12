import type { OrderStatus, VehicleType } from './enums';
import type { LatLng } from './geo';
import type { Satang } from './money';

/** Socket.IO event names shared by server and clients. */
export const WsEvent = {
  // server -> driver
  OFFER_NEW: 'offer:new',
  OFFER_REVOKED: 'offer:revoked',
  // server -> customer / ops
  ORDER_UPDATED: 'order:updated',
  DRIVER_LOCATION: 'driver:location',
  // server -> ops
  OPS_ALERT: 'ops:alert',
  OPS_DRIVER_LOCATION: 'ops:driver-location',
  OPS_ORDER_UPDATED: 'ops:order-updated',
  // client -> server
  LOCATION_PING: 'location:ping',
  SUBSCRIBE_ORDER: 'order:subscribe',
  UNSUBSCRIBE_ORDER: 'order:unsubscribe',
} as const;

export interface JobOfferPayload {
  offerId: string;
  orderId: string;
  orderNo: string;
  expiresAt: string;
  vehicleType: VehicleType;
  pickup: { address: string; district?: string | null; location: LatLng };
  dropoffs: { address: string; district?: string | null; location: LatLng }[];
  stopCount: number;
  distanceToPickupM: number;
  deliveryDistanceM: number;
  estimatedDurationS: number;
  grossFare: Satang;
  commission: Satang;
  commissionRateBp: number;
  bonus: Satang;
  netEarnings: Satang;
  cashToCollect: Satang;
  parcelSummary: string;
}

export interface OrderUpdatedPayload {
  orderId: string;
  status: OrderStatus;
  at: string;
  driver?: DriverPublicInfo | null;
  etaSeconds?: number | null;
}

export interface DriverPublicInfo {
  id: string;
  name: string;
  phoneMasked: string;
  photoUrl?: string | null;
  rating: number | null;
  vehicle: { type: VehicleType; plateNumber: string; plateProvince: string; brand?: string | null; model?: string | null; color?: string | null };
}

export interface DriverLocationPayload {
  orderId?: string;
  driverId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  ts: number;
  etaSeconds?: number | null;
}

/** Recommended GPS cadence per state (spec §21), in milliseconds. */
export const GPS_INTERVAL_MS = {
  OFFLINE: null,
  ONLINE_IDLE: 30_000,
  OFFERED: 15_000,
  ACTIVE_TO_PICKUP: 5_000,
  ACTIVE_IN_TRANSIT: 5_000,
} as const;
/** Minimum distance between pings (meters) for the OS-level location filter. */
export const GPS_DISTANCE_FILTER_M = {
  ONLINE_IDLE: 50,
  ACTIVE: 15,
} as const;
