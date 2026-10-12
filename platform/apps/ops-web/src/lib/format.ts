import { formatTHB, ORDER_STATUS_TH, ORDER_STATUS_TONE, OrderStatus, VEHICLE_TH, VehicleType } from '@ship/shared';
import dayjs from 'dayjs';

export const thb = (satang: number | null | undefined) => (satang === null || satang === undefined ? '–' : formatTHB(satang));
export const km = (m: number | null | undefined) => (m === null || m === undefined ? '–' : `${(m / 1000).toFixed(1)} กม.`);
export const mins = (s: number | null | undefined) => (s === null || s === undefined ? '–' : `${Math.round(s / 60)} นาที`);
export const time = (iso: string | null | undefined) => (iso ? dayjs(iso).format('DD/MM HH:mm:ss') : '–');
export const shortTime = (iso: string | null | undefined) => (iso ? dayjs(iso).format('HH:mm') : '–');
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v * 1000) / 10}%`);
export const vehicleName = (v: string) => VEHICLE_TH[v as VehicleType]?.name ?? v;
export const statusText = (s: string) => ORDER_STATUS_TH[s as OrderStatus] ?? s;

export type TagTheme = 'default' | 'primary' | 'warning' | 'danger' | 'success';
export function statusTheme(s: string): TagTheme {
  const tone = ORDER_STATUS_TONE[s as OrderStatus];
  return ({ neutral: 'default', brand: 'primary', warning: 'warning', error: 'danger', success: 'success' } as const)[tone ?? 'neutral'];
}

export const PRESENCE_TH: Record<string, string> = { ONLINE: 'ว่าง', BUSY: 'มีงาน', OFFLINE: 'ออฟไลน์' };
export const PRESENCE_COLOR: Record<string, string> = { ONLINE: '#2BA471', BUSY: '#0052D9', OFFLINE: '#A6A6A6' };
