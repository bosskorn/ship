/**
 * Money is handled as integer satang (1 THB = 100 satang) in application code
 * and stored as NUMERIC(14,2) baht in PostgreSQL. Never use floating point
 * baht for arithmetic.
 */
export type Satang = number;

export function assertSatang(v: Satang): Satang {
  if (!Number.isSafeInteger(v)) throw new Error(`Invalid satang amount: ${v}`);
  return v;
}

/** Parse a NUMERIC string from Postgres (e.g. "110.50") into satang without float math. */
export function numericToSatang(value: string | number | null | undefined): Satang {
  if (value === null || value === undefined) return 0;
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const neg = s.startsWith('-');
  const [intPart, fracPart = ''] = (neg ? s.slice(1) : s).split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const result = Number(intPart || '0') * 100 + Number(frac);
  return neg ? -result : result;
}

/** Format satang as a NUMERIC literal string for Postgres. */
export function satangToNumeric(v: Satang): string {
  assertSatang(v);
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** Multiply by a percentage expressed in basis points (1% = 100 bp), rounding half up. */
export function applyBasisPoints(amount: Satang, bp: number): Satang {
  if (!Number.isInteger(bp)) throw new Error(`basis points must be integer: ${bp}`);
  const raw = amount * bp;
  const q = Math.trunc(raw / 10_000);
  const r = raw - q * 10_000;
  // half-up away from zero
  if (Math.abs(r) * 2 >= 10_000) return q + Math.sign(raw);
  return q;
}

/** Multiply by an integer multiplier expressed in thousandths (1.25x = 1250), half-up. */
export function applyMilli(amount: Satang, milli: number): Satang {
  if (!Number.isInteger(milli)) throw new Error(`milli multiplier must be integer: ${milli}`);
  const raw = amount * milli;
  const q = Math.trunc(raw / 1000);
  const r = raw - q * 1000;
  if (Math.abs(r) * 2 >= 1000) return q + Math.sign(raw);
  return q;
}

/** Round up to a whole-baht or other step (e.g. 100 = round to 1 THB). */
export function roundUpTo(amount: Satang, step: Satang): Satang {
  if (step <= 0) return amount;
  return Math.ceil(amount / step) * step;
}

export function formatTHB(v: Satang, opts: { decimals?: boolean } = {}): string {
  const baht = v / 100;
  const decimals = opts.decimals ?? v % 100 !== 0;
  return `฿${baht.toLocaleString('th-TH', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}
