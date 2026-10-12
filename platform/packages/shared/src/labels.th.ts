import type { KycStatus, OrderStatus, PaymentMethod, VehicleType } from './enums';

export const ORDER_STATUS_TH: Record<OrderStatus, string> = {
  DRAFT: 'ร่าง',
  QUOTED: 'เสนอราคาแล้ว',
  PAYMENT_PENDING: 'รอชำระเงิน',
  SCHEDULED: 'จองล่วงหน้า',
  SEARCHING_DRIVER: 'กำลังหาคนขับ',
  DRIVER_ASSIGNED: 'ได้คนขับแล้ว',
  GOING_TO_PICKUP: 'กำลังไปจุดรับ',
  ARRIVED_PICKUP: 'ถึงจุดรับแล้ว',
  PICKED_UP: 'รับสินค้าแล้ว',
  IN_TRANSIT: 'กำลังจัดส่ง',
  ARRIVED_DESTINATION: 'ถึงจุดส่งแล้ว',
  DELIVERED: 'ส่งสำเร็จ',
  CANCELLED: 'ยกเลิก',
  FAILED: 'ส่งไม่สำเร็จ',
  NO_DRIVER: 'ไม่พบคนขับ',
  RETURNING: 'กำลังส่งคืน',
  RETURNED: 'ส่งคืนแล้ว',
};

export const VEHICLE_TH: Record<VehicleType, { name: string; description: string; maxWeightKg: number; dimensions: string }> = {
  MOTORCYCLE: { name: 'มอเตอร์ไซค์', description: 'เอกสาร อาหาร กล่องเล็ก', maxWeightKg: 20, dimensions: '50×50×50 ซม.' },
  CAR: { name: 'รถยนต์', description: 'ของเปราะบาง หรือไม่เหมาะกับมอเตอร์ไซค์', maxWeightKg: 100, dimensions: '100×60×50 ซม.' },
  PICKUP: { name: 'กระบะ', description: 'สินค้าขนาดใหญ่ เฟอร์นิเจอร์', maxWeightKg: 1000, dimensions: '210×150×120 ซม.' },
  VAN: { name: 'รถตู้', description: 'สินค้าจำนวนมาก งานธุรกิจ', maxWeightKg: 1100, dimensions: '260×150×130 ซม.' },
};

export const KYC_STATUS_TH: Record<KycStatus, string> = {
  DRAFT: 'ร่าง',
  PENDING: 'รอส่งตรวจ',
  REVIEW: 'กำลังตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
  SUSPENDED: 'ระงับการใช้งาน',
};

export const PAYMENT_METHOD_TH: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  QR: 'QR พร้อมเพย์',
  CARD: 'บัตรเครดิต/เดบิต',
  WALLET: 'วอลเล็ต',
  CORPORATE_CREDIT: 'เครดิตองค์กร',
};

/** Coarse state colour semantics (TDesign-style status tokens). */
export type StatusTone = 'neutral' | 'brand' | 'warning' | 'success' | 'error';
export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  DRAFT: 'neutral',
  QUOTED: 'neutral',
  PAYMENT_PENDING: 'warning',
  SCHEDULED: 'neutral',
  SEARCHING_DRIVER: 'warning',
  DRIVER_ASSIGNED: 'brand',
  GOING_TO_PICKUP: 'brand',
  ARRIVED_PICKUP: 'brand',
  PICKED_UP: 'brand',
  IN_TRANSIT: 'brand',
  ARRIVED_DESTINATION: 'brand',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
  FAILED: 'error',
  NO_DRIVER: 'error',
  RETURNING: 'warning',
  RETURNED: 'neutral',
};
