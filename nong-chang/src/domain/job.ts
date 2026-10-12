/**
 * Job lifecycle (spec §40, §50). Status order is the single source of truth
 * for timelines on both the customer and technician apps.
 */
export type JobStatus =
  | 'created'
  | 'matching'
  | 'matched'
  | 'en_route'
  | 'arrived'
  | 'started' // PIN verified, inspecting
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'confirmed'
  | 'paid'
  | 'reviewed'
  | 'cancelled';

export const JOB_FLOW: JobStatus[] = [
  'created',
  'matching',
  'matched',
  'en_route',
  'arrived',
  'started',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'confirmed',
  'paid',
  'reviewed',
];

export const STATUS_LABEL: Record<JobStatus, string> = {
  created: 'สร้างงาน',
  matching: 'กำลังค้นหาช่าง',
  matched: 'ช่างรับงาน',
  en_route: 'ช่างกำลังเดินทาง',
  arrived: 'ช่างถึงหน้างาน',
  started: 'กำลังตรวจหน้างาน',
  quoted: 'รออนุมัติราคา',
  approved: 'อนุมัติราคาแล้ว',
  in_progress: 'กำลังดำเนินงาน',
  completed: 'รอยืนยันงานเสร็จ',
  confirmed: 'รอชำระเงิน',
  paid: 'ชำระเงินแล้ว',
  reviewed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

export type StatusTone = 'primary' | 'success' | 'warning' | 'error' | 'default';
export function statusTone(s: JobStatus): StatusTone {
  if (s === 'cancelled') return 'error';
  if (s === 'quoted' || s === 'completed' || s === 'confirmed') return 'warning';
  if (s === 'paid' || s === 'reviewed') return 'success';
  if (s === 'created') return 'default';
  return 'primary';
}

export function isActive(s: JobStatus) {
  return s !== 'paid' && s !== 'reviewed' && s !== 'cancelled' && s !== 'created';
}

export function hasReached(current: JobStatus, target: JobStatus) {
  if (current === 'cancelled') return false;
  return JOB_FLOW.indexOf(current) >= JOB_FLOW.indexOf(target);
}

/** Guard: work may only start after customer approval (spec §33). */
export function canStartWork(s: JobStatus) {
  return s === 'approved';
}

const NEXT: Partial<Record<JobStatus, JobStatus[]>> = {
  created: ['matching', 'cancelled'],
  matching: ['matched', 'cancelled'],
  matched: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['started', 'cancelled'],
  started: ['quoted', 'approved'], // fixed-price jobs skip quoting
  quoted: ['approved', 'cancelled'],
  approved: ['in_progress'],
  in_progress: ['completed'],
  completed: ['confirmed'],
  confirmed: ['paid'],
  paid: ['reviewed'],
};

export function canTransition(from: JobStatus, to: JobStatus) {
  return NEXT[from]?.includes(to) ?? false;
}

/** Customer-facing tracking timeline (spec §30). */
export const TRACKING_STEPS: { status: JobStatus; label: string }[] = [
  { status: 'matched', label: 'รับงาน' },
  { status: 'en_route', label: 'กำลังเดินทาง' },
  { status: 'arrived', label: 'ถึงหน้างาน' },
  { status: 'in_progress', label: 'กำลังดำเนินงาน' },
  { status: 'completed', label: 'เสร็จสิ้น' },
];

/** Full job-detail timeline (spec §40). */
export const DETAIL_STEPS: { status: JobStatus; label: string }[] = [
  { status: 'created', label: 'สร้างงาน' },
  { status: 'matching', label: 'จับคู่ช่าง' },
  { status: 'matched', label: 'รับงาน' },
  { status: 'en_route', label: 'เดินทาง' },
  { status: 'arrived', label: 'ถึงหน้างาน' },
  { status: 'started', label: 'เริ่มงาน' },
  { status: 'quoted', label: 'เสนอราคา' },
  { status: 'approved', label: 'ลูกค้าอนุมัติ' },
  { status: 'completed', label: 'เสร็จ' },
  { status: 'paid', label: 'ชำระเงิน' },
];
