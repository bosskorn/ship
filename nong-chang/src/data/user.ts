export type PlaceType = 'home' | 'condo' | 'office' | 'other';

export interface Address {
  id: string;
  label: string;
  type: PlaceType;
  line: string;
  district: string;
  lat: number;
  lng: number;
  houseNo?: string;
  building?: string;
  floor?: string;
  room?: string;
  note?: string;
  landmark?: string;
}

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  home: 'บ้าน',
  condo: 'คอนโด',
  office: 'สำนักงาน',
  other: 'อื่น ๆ',
};

export const DEFAULT_ADDRESS: Address = {
  id: 'addr-home',
  label: 'บ้าน',
  type: 'home',
  line: '88/12 ซ.ลาดพร้าว 71',
  district: 'ลาดพร้าว กรุงเทพฯ',
  lat: 13.8167,
  lng: 100.6006,
  houseNo: '88/12',
  landmark: 'ประตูสีเทา ตรงข้าม 7-Eleven',
};

export const USER = {
  name: 'คุณกานต์',
  phone: '081-234-5678',
  initials: 'ก',
};

export interface Appliance {
  id: string;
  type: 'แอร์' | 'เครื่องทำน้ำอุ่น' | 'เครื่องซักผ้า' | 'เครื่องกรองน้ำ';
  room: string;
  brand: string;
  model: string;
  installed: string;
  lastService?: string;
  nextMaintenance?: string;
  warrantyUntil?: string;
}

export interface Property {
  id: string;
  name: string;
  type: PlaceType;
  rooms: string[];
  appliances: Appliance[];
}

export const PROPERTIES: Property[] = [
  {
    id: 'p-home',
    name: 'บ้านลาดพร้าว',
    type: 'home',
    rooms: ['ห้องนอน', 'ห้องนั่งเล่น', 'ห้องน้ำ', 'ครัว'],
    appliances: [
      { id: 'a1', type: 'แอร์', room: 'ห้องนอน', brand: 'Daikin', model: 'FTKF12', installed: 'มี.ค. 2566', lastService: '20 ต.ค. 2569', nextMaintenance: 'เม.ย. 2570', warrantyUntil: '19 พ.ย. 2569' },
      { id: 'a2', type: 'แอร์', room: 'ห้องนั่งเล่น', brand: 'Mitsubishi', model: 'MSY-KX18', installed: 'ม.ค. 2565', nextMaintenance: 'ธ.ค. 2569' },
      { id: 'a3', type: 'เครื่องทำน้ำอุ่น', room: 'ห้องน้ำ', brand: 'Panasonic', model: 'DH-4NS1', installed: 'ส.ค. 2564' },
      { id: 'a4', type: 'เครื่องกรองน้ำ', room: 'ครัว', brand: 'Mazuma', model: 'RO-5', installed: 'มิ.ย. 2567', nextMaintenance: 'พ.ย. 2569' },
    ],
  },
];
