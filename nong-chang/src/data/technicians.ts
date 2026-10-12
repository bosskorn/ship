import type { Candidate } from '@/domain/dispatch';

export interface Technician extends Candidate {
  name: string;
  verified: boolean;
  jobs: number;
  specialty: string;
  phone: string;
  /** Accessibility label / fallback. */
  initials: string;
  /** Profile photo from KYC onboarding. Undefined until uploaded. */
  photo?: string;
  vehicle?: string;
  /** Offset from the customer in degrees (mock positions). */
  offset: { lat: number; lng: number };
}

export const TECHNICIANS: Technician[] = [
  {
    id: 't-somchai',
    name: 'สมชาย พ.',
    initials: 'สช',
    verified: true,
    jobs: 1248,
    specialty: 'เชี่ยวชาญงานแอร์',
    vehicle: 'Honda Wave · 1กข 2345',
    phone: '0800000001',
    online: true,
    busy: false,
    distanceKm: 3.4,
    skills: ['aircon', 'electrical'],
    rating: 4.9,
    successRate: 0.98,
    acceptanceRate: 0.92,
    cancellationRate: 0.01,
    offset: { lat: 0.022, lng: -0.018 },
  },
  {
    id: 't-wichai',
    name: 'วิชัย ส.',
    initials: 'วช',
    verified: true,
    jobs: 864,
    specialty: 'เชี่ยวชาญงานประปา',
    vehicle: 'Yamaha Fino · 2ขค 8812',
    phone: '0800000002',
    online: true,
    busy: false,
    distanceKm: 2.1,
    skills: ['plumbing'],
    rating: 4.8,
    successRate: 0.96,
    acceptanceRate: 0.88,
    cancellationRate: 0.02,
    offset: { lat: -0.014, lng: 0.012 },
  },
  {
    id: 't-anan',
    name: 'อนันต์ ก.',
    initials: 'อน',
    verified: true,
    jobs: 532,
    specialty: 'ช่างไฟฟ้า มีใบอนุญาต',
    vehicle: 'Honda Click · 3คง 4410',
    phone: '0800000003',
    online: true,
    busy: false,
    distanceKm: 4.2,
    skills: ['electrical', 'aircon'],
    rating: 4.7,
    successRate: 0.95,
    acceptanceRate: 0.9,
    cancellationRate: 0.03,
    offset: { lat: 0.018, lng: 0.024 },
  },
  {
    id: 't-malee',
    name: 'มาลี จ.',
    initials: 'มล',
    verified: true,
    jobs: 1530,
    specialty: 'แม่บ้านมืออาชีพ',
    vehicle: 'Honda Scoopy · 4งจ 1290',
    phone: '0800000004',
    online: true,
    busy: false,
    distanceKm: 1.6,
    skills: ['cleaning'],
    rating: 4.9,
    successRate: 0.99,
    acceptanceRate: 0.95,
    cancellationRate: 0.01,
    offset: { lat: -0.01, lng: -0.012 },
  },
  ...Array.from({ length: 6 }, (_, i): Technician => ({
    id: `t-pool-${i}`,
    name: `ช่างใกล้คุณ ${i + 1}`,
    initials: 'ช',
    verified: true,
    jobs: 100 + i * 37,
    specialty: 'งานทั่วไป',
    phone: '0800000099',
    online: i !== 5,
    busy: i % 3 === 0,
    distanceKm: 2 + i * 0.9,
    skills: ['aircon', 'plumbing', 'electrical'],
    rating: 4.4 + (i % 4) * 0.1,
    successRate: 0.9,
    acceptanceRate: 0.8,
    cancellationRate: 0.05,
    offset: { lat: (i - 3) * 0.008, lng: (3 - i) * 0.01 },
  })),
];

export const technicianById = (id: string) => TECHNICIANS.find((t) => t.id === id);
