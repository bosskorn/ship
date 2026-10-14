/**
 * Locale-aware formatting through Intl. The Intl locale per app language lives in the
 * language registry (Thai: th-TH, Buddhist calendar by default — spec §51), so a new
 * language gets its date, digit and separator conventions without changes here.
 */
import { languageInfo } from './languages';

export function intlLocale(language: string): string {
  return languageInfo(language).intlLocale;
}

export function formatDate(ts: number, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
}

export function formatDateTimeCompact(ts: number, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ts);
}

export function formatNumber(n: number, language: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits }).format(n);
}

/** File size with the locale's decimal separator and digits (units stay KB/MB/GB, as on Android). */
export function formatBytes(bytes: number, language = 'en'): string {
  if (bytes < 1024) return `${formatNumber(bytes, language)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${formatNumber(v < 10 ? Math.round(v * 10) / 10 : Math.round(v), language, 1)} ${units[i]}`;
}
