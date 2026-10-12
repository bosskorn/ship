import { ORDER_STATUS_TH, ORDER_STATUS_TONE, OrderStatus } from '@ship/shared';
import type { Tone } from './theme';

export const km = (m: number | null | undefined) => (m == null ? '–' : `${(m / 1000).toFixed(1)} กม.`);
export const minutes = (s: number | null | undefined) => (s == null ? '–' : `${Math.max(1, Math.round(s / 60))} นาที`);
export const statusText = (s: string) => ORDER_STATUS_TH[s as OrderStatus] ?? s;
export const statusTone = (s: string): Tone => {
  const t = ORDER_STATUS_TONE[s as OrderStatus] ?? 'neutral';
  return t === 'error' ? 'danger' : t;
};
export const timeHM = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const dateShort = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + timeHM(iso);
};
