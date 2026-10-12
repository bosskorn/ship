const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** 1590 → "1,590", 590.5 → "590.50" */
export function formatBaht(amount: number, opts: { decimals?: boolean } = {}) {
  const decimals = opts.decimals ?? !Number.isInteger(amount);
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}

export function formatTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "18 พ.ย." */
export function formatShortDate(d: Date) {
  return `${d.getDate()} ${thMonths[d.getMonth()]}`;
}

/** "จ. 18 พ.ย." */
export function formatDayDate(d: Date) {
  return `${thDays[d.getDay()]} ${formatShortDate(d)}`;
}

export function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
}

export function formatRange(min: number, max: number, unit: string) {
  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
}
