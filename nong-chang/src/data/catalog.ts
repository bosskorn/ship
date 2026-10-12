/**
 * Service catalog. Phase 1 (spec §56) opens aircon, plumbing, electrical and
 * housekeeping; other categories are listed but disabled until supply exists.
 */
import type { PricingModel } from '@/domain/pricing';

export type CategoryId =
  | 'aircon'
  | 'plumbing'
  | 'electrical'
  | 'cleaning'
  | 'appliance'
  | 'install'
  | 'maintenance'
  | 'interior'
  | 'exterior';

export interface Category {
  id: CategoryId;
  name: string;
  shortName: string;
  available: boolean;
}

export interface Service {
  id: string;
  categoryId: CategoryId;
  name: string;
  pricing: PricingModel;
  /** Fixed price per unit, or inspection fee. */
  price: number;
  unit: string;
  durationMin: number;
  durationMax: number;
  warrantyDays: number;
  included: string[];
  notIncluded: string[];
  /** Natural-language keywords used by search and photo diagnosis. */
  keywords: string[];
  recommended?: boolean;
  /** Aggregate customer rating for the service (mock until reviews API). */
  rating?: number;
  reviews?: number;
}

export const CATEGORIES: Category[] = [
  { id: 'aircon', name: 'ระบบปรับอากาศ', shortName: 'แอร์', available: true },
  { id: 'plumbing', name: 'ประปา', shortName: 'ประปา', available: true },
  { id: 'electrical', name: 'ระบบไฟฟ้า', shortName: 'ไฟฟ้า', available: true },
  { id: 'cleaning', name: 'ทำความสะอาด', shortName: 'แม่บ้าน', available: true },
  { id: 'appliance', name: 'เครื่องใช้ไฟฟ้า', shortName: 'เครื่องใช้ไฟฟ้า', available: false },
  { id: 'install', name: 'ติดตั้ง', shortName: 'ติดตั้ง', available: false },
  { id: 'maintenance', name: 'ซ่อมบำรุง', shortName: 'งานทั่วไป', available: false },
  { id: 'interior', name: 'งานภายในบ้าน', shortName: 'ภายในบ้าน', available: false },
  { id: 'exterior', name: 'งานภายนอกบ้าน', shortName: 'ภายนอกบ้าน', available: false },
];

/** Home quick services (spec §18) — exactly six. */
export const QUICK_CATEGORIES: CategoryId[] = ['aircon', 'plumbing', 'electrical', 'cleaning', 'appliance', 'maintenance'];

const INSPECTION_FEE = 199;
const inspection = (
  id: string,
  categoryId: CategoryId,
  name: string,
  keywords: string[],
  extra: Partial<Service> = {},
): Service => ({
  id,
  categoryId,
  name,
  pricing: 'inspection',
  price: INSPECTION_FEE,
  unit: 'ครั้ง',
  durationMin: 30,
  durationMax: 90,
  warrantyDays: 30,
  included: ['ตรวจหน้างานและวิเคราะห์ปัญหา', 'แจ้งใบเสนอราคาก่อนเริ่มซ่อม', 'หักค่าสำรวจเมื่ออนุมัติงานซ่อม'],
  notIncluded: ['อะไหล่', 'งานซ่อมที่ไม่ได้อนุมัติ'],
  keywords,
  ...extra,
});

export const SERVICES: Service[] = [
  {
    id: 'aircon-wash',
    categoryId: 'aircon',
    name: 'ล้างแอร์ติดผนัง',
    pricing: 'fixed',
    price: 590,
    unit: 'เครื่อง',
    durationMin: 45,
    durationMax: 60,
    warrantyDays: 30,
    included: ['ล้าง Filter', 'ล้าง Coil', 'ล้างถาดน้ำ', 'ตรวจ Drain', 'Test ระบบ'],
    notIncluded: ['เติมน้ำยา', 'อะไหล่', 'ซ่อมระบบ'],
    keywords: ['ล้างแอร์', 'แอร์', 'แอร์เหม็น', 'แอร์สกปรก', 'aircon', 'ac'],
    recommended: true,
    rating: 4.9,
    reviews: 2184,
  },
  inspection('aircon-not-cold', 'aircon', 'แอร์ไม่เย็น', ['แอร์ไม่เย็น', 'แอร์ร้อน', 'น้ำยาแอร์', 'คอมแอร์']),
  inspection('aircon-leak', 'aircon', 'แอร์น้ำหยด', ['น้ำหยด', 'แอร์น้ำหยด', 'แอร์รั่ว', 'แอร์มีน้ำ']),
  inspection('aircon-check', 'aircon', 'ตรวจระบบแอร์', ['ตรวจแอร์', 'แอร์เสียงดัง', 'แอร์ไม่ติด']),

  inspection('plumbing-leak', 'plumbing', 'น้ำรั่ว', ['น้ำรั่ว', 'ท่อรั่ว', 'น้ำซึม', 'ท่อแตก'], { recommended: true, rating: 4.8, reviews: 936 }),
  inspection('plumbing-faucet', 'plumbing', 'ก๊อกน้ำรั่ว', ['ก๊อกรั่ว', 'ก๊อก', 'ก๊อกหยด', 'วาล์ว']),
  inspection('plumbing-clog', 'plumbing', 'ท่อตัน', ['ท่อตัน', 'อ่างตัน', 'ซิงค์ตัน', 'น้ำไม่ลง']),
  inspection('plumbing-toilet', 'plumbing', 'ชักโครก', ['ชักโครก', 'ส้วม', 'ชักโครกตัน', 'ชักโครกไม่ไหล']),

  inspection('electric-outlet', 'electrical', 'ปลั๊กไฟ', ['ปลั๊กเสีย', 'ปลั๊ก', 'ปลั๊กไหม้', 'เต้ารับ']),
  inspection('electric-switch', 'electrical', 'สวิตช์ไฟ', ['สวิตช์', 'สวิทช์', 'กดไฟไม่ติด']),
  inspection('electric-light', 'electrical', 'ไฟไม่ติด', ['ไฟไม่ติด', 'หลอดไฟ', 'โคมไฟ', 'ไฟดับ'], { recommended: true }),
  inspection('electric-breaker', 'electrical', 'เบรกเกอร์', ['เบรกเกอร์', 'breaker', 'ไฟตัด', 'ไฟช็อต', 'ตู้ไฟ']),

  ...[2, 3, 4].map(
    (h): Service => ({
      id: `cleaning-${h}h`,
      categoryId: 'cleaning',
      name: `แม่บ้าน ${h} ชม.`,
      pricing: 'fixed',
      price: 200 * h + 40,
      unit: 'ครั้ง',
      durationMin: h * 60,
      durationMax: h * 60,
      warrantyDays: 1,
      included: ['กวาด ถู ดูดฝุ่น', 'เช็ดโต๊ะ ชั้นวาง', 'ทำความสะอาดห้องน้ำ', 'เก็บขยะ'],
      notIncluded: ['ล้างจานปริมาณมาก', 'ซักรีด', 'ทำความสะอาดภายนอกอาคาร'],
      keywords: ['แม่บ้าน', 'ทำความสะอาด', 'clean', `${h} ชม`],
      recommended: h === 3,
    }),
  ),
];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const servicesIn = (categoryId: CategoryId) => SERVICES.filter((s) => s.categoryId === categoryId);
