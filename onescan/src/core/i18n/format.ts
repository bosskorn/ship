/**
 * Locale-aware formatting. Thai locale uses the Buddhist calendar by default
 * (regional intelligence, spec §51) via Intl.
 */
export function intlLocale(language: string): string {
  return language === 'th' ? 'th-TH' : language === 'en' ? 'en-GB' : language;
}

export function formatDate(ts: number, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
}

export function formatDateTimeCompact(ts: number, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ts);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
