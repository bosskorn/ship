import type { OrderStatus, PaymentMethod, VehicleType } from './enums';
import type { LatLng } from './geo';
import type { Satang } from './money';
import type { DriverPublicInfo } from './realtime';

/** Customer-facing quote line. All amounts in satang. */
export interface QuoteBreakdown {
  baseFare: Satang;
  distanceFee: Satang;
  vehicleFee: Satang;
  additionalStopsFee: Satang;
  specialServicesFee: Satang;
  tollParking: Satang;
  /** Combined demand/traffic/time-of-day adjustment. */
  demandAdjustment: Satang;
  trafficAdjustment: Satang;
  minimumFareTopUp: Satang;
  /** Platform-only fee added by the margin guard (SERVICE_FEE mode). Not shared with the driver. */
  serviceFee: Satang;
  subtotal: Satang;
  promotionDiscount: Satang;
  total: Satang;
}

export interface QuoteOption {
  quoteId: string;
  vehicleType: VehicleType;
  available: boolean;
  unavailableReason?: string;
  price: Satang;
  breakdown: QuoteBreakdown;
  distanceM: number;
  durationS: number;
  driverEtaS: number | null;
  expiresAt: string;
  surgeMilli: number;
}

export interface QuoteResponse {
  zone: { id: string; code: string; name: string } | null;
  options: QuoteOption[];
}

export interface OrderStopView {
  id: string;
  seq: number;
  type: 'PICKUP' | 'DROPOFF';
  status: string;
  address: string;
  building?: string | null;
  floor?: string | null;
  room?: string | null;
  contactName: string;
  contactPhone: string;
  note?: string | null;
  location: LatLng;
  /** Only returned to the customer who owns the order. */
  otp?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
}

export interface OrderView {
  id: string;
  orderNo: string;
  status: OrderStatus;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  price: Satang;
  breakdown: QuoteBreakdown;
  distanceM: number;
  durationS: number;
  createdAt: string;
  updatedAt: string;
  stops: OrderStopView[];
  driver: DriverPublicInfo | null;
  parcel: Record<string, unknown>;
  rating?: { score: number; comment?: string | null } | null;
}

export interface TimelineEvent {
  id: string;
  at: string;
  type: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actorType: string;
  actorId: string | null;
  data: Record<string, unknown>;
}

export interface EarningsSummary {
  period: 'today' | 'week' | 'month';
  from: string;
  to: string;
  trips: number;
  grossFare: Satang;
  commission: Satang;
  bonus: Satang;
  tips: Satang;
  adjustment: Satang;
  netEarnings: Satang;
  onlineSeconds: number;
  deadMileageM: number;
  loadedMileageM: number;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
