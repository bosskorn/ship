export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  OPS: 'OPS',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const VehicleType = {
  MOTORCYCLE: 'MOTORCYCLE',
  CAR: 'CAR',
  PICKUP: 'PICKUP',
  VAN: 'VAN',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];
export const VEHICLE_TYPES: VehicleType[] = ['MOTORCYCLE', 'CAR', 'PICKUP', 'VAN'];

export const OrderStatus = {
  DRAFT: 'DRAFT',
  QUOTED: 'QUOTED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  /** Booked for later; dispatch starts `scheduledDispatchLeadMin` before pickup. */
  SCHEDULED: 'SCHEDULED',
  SEARCHING_DRIVER: 'SEARCHING_DRIVER',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  GOING_TO_PICKUP: 'GOING_TO_PICKUP',
  ARRIVED_PICKUP: 'ARRIVED_PICKUP',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED_DESTINATION: 'ARRIVED_DESTINATION',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  NO_DRIVER: 'NO_DRIVER',
  RETURNING: 'RETURNING',
  RETURNED: 'RETURNED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const KycStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const DriverTier = {
  NEW: 'NEW',
  STANDARD: 'STANDARD',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  PRO: 'PRO',
} as const;
export type DriverTier = (typeof DriverTier)[keyof typeof DriverTier];

/** Driver availability as seen by dispatch. */
export const DriverPresence = {
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
  BUSY: 'BUSY',
} as const;
export type DriverPresence = (typeof DriverPresence)[keyof typeof DriverPresence];

export const PaymentMethod = {
  CASH: 'CASH',
  QR: 'QR',
  CARD: 'CARD',
  WALLET: 'WALLET',
  CORPORATE_CREDIT: 'CORPORATE_CREDIT',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const OfferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const StopType = {
  PICKUP: 'PICKUP',
  DROPOFF: 'DROPOFF',
} as const;
export type StopType = (typeof StopType)[keyof typeof StopType];

export const StopStatus = {
  PENDING: 'PENDING',
  ARRIVED: 'ARRIVED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type StopStatus = (typeof StopStatus)[keyof typeof StopStatus];

export const ActorType = {
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  OPS: 'OPS',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const ServiceType = {
  INSTANT: 'INSTANT',
  MULTI_STOP: 'MULTI_STOP',
  SCHEDULED: 'SCHEDULED',
  BUSINESS: 'BUSINESS',
} as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];
