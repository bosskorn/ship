/**
 * On-device sensitive data detection over OCR text (spec §17).
 * Pure TypeScript: no network, no native dependency, fully unit-tested.
 * Regional rules (Thai ID, Thai phones, Buddhist calendar…) are an
 * "intelligence pack" and can be extended per country without forking.
 */
export type PiiType =
  | 'national_id'
  | 'passport'
  | 'phone'
  | 'email'
  | 'address'
  | 'bank_account'
  | 'credit_card'
  | 'tax_id'
  | 'signature'
  | 'medical';

export interface PiiMatch {
  type: PiiType;
  start: number;
  end: number;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Thai 13-digit citizen / juristic tax ID checksum (mod 11). */
export function isValidThaiId(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

export function isValidLuhn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function context(text: string, start: number, end: number, radius = 40) {
  return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius)).toLowerCase();
}

type Rule = (text: string) => PiiMatch[];

function collect(re: RegExp, text: string, build: (m: RegExpExecArray) => PiiMatch | null): PiiMatch[] {
  const out: PiiMatch[] = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const r = build(m);
    if (r) out.push(r);
  }
  return out;
}

const TAX_HINT = /(tax\s*id|taxpayer|เลขประจำตัวผู้เสียภาษี|ผู้เสียภาษี|เลขทะเบียนนิติบุคคล)/;
const BANK_HINT = /(account|a\/c|acct|บัญชี|เลขที่บัญชี|ธนาคาร|bank)/;
const PASSPORT_HINT = /(passport|หนังสือเดินทาง)/;

const rules: Rule[] = [
  // Thai 13-digit IDs: 1-2345-67890-12-3, 1 2345 67890 12 3, 1234567890123
  (t) =>
    collect(/(?<!\d)\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d(?!\d)/, t, (m) => {
      if (!isValidThaiId(m[0])) return null;
      const end = m.index + m[0].length;
      const isTax = digitsOnly(m[0])[0] === '0' || TAX_HINT.test(context(t, m.index, end));
      return { type: isTax ? 'tax_id' : 'national_id', start: m.index, end, value: m[0], confidence: 'high' };
    }),
  (t) =>
    collect(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, t, (m) => ({
      type: 'email', start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'high',
    })),
  // Payment cards: 13–19 digits in groups, Luhn-valid.
  (t) =>
    collect(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/, t, (m) => {
      const d = digitsOnly(m[0]);
      if (d.length === 13 && isValidThaiId(d)) return null;
      if (!isValidLuhn(d)) return null;
      return { type: 'credit_card', start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'high' };
    }),
  // Thai phones: mobile 0[689]x-xxx-xxxx, landline 0x-xxx-xxxx, +66 forms.
  (t) =>
    collect(/(?<![\d+])(?:\+66[\s-]?|0)(?:[689]\d[\s-]?\d{3}[\s-]?\d{4}|[2-7][\s-]?\d{3}[\s-]?\d{4})(?!\d)/, t, (m) => ({
      type: 'phone', start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'high',
    })),
  // Thai bank accounts (xxx-x-xxxxx-x) or 10–12 digits near a banking keyword.
  (t) =>
    collect(/(?<!\d)(?:\d{3}-\d-\d{5}-\d|\d{10,12})(?!\d)/, t, (m) => {
      const end = m.index + m[0].length;
      const formatted = /^\d{3}-\d-\d{5}-\d$/.test(m[0]);
      if (!formatted && !BANK_HINT.test(context(t, m.index, end))) return null;
      return { type: 'bank_account', start: m.index, end, value: m[0], confidence: formatted ? 'high' : 'medium' };
    }),
  (t) =>
    collect(/(?<![A-Z0-9])[A-Z]{1,2}\d{6,8}(?![A-Z0-9])/, t, (m) => {
      const end = m.index + m[0].length;
      if (!PASSPORT_HINT.test(context(t, m.index, end))) return null;
      return { type: 'passport', start: m.index, end, value: m[0], confidence: 'medium' };
    }),
  // Address: a line containing a Thai postcode and an address keyword.
  (t) =>
    collect(/[^\n]*(?:ถนน|ซอย|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|road|street|soi|district|province)[^\n]*\b\d{5}\b[^\n]*/i, t, (m) => ({
      type: 'address', start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'low',
    })),
  (t) =>
    collect(/[^\n]*(?:diagnosis|prescription|blood type|\bhn\s*[:#.]|การวินิจฉัย|ผลตรวจ|ใบรับรองแพทย์|กรุ๊ปเลือด)[^\n]*/i, t, (m) => ({
      type: 'medical', start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'low',
    })),
];

const priority: Record<PiiType, number> = {
  national_id: 9, tax_id: 9, credit_card: 8, passport: 7, bank_account: 6, email: 5, phone: 4,
  address: 2, medical: 1, signature: 0,
};

/** Detect PII; overlapping matches resolve to the higher-priority, then longer, match. */
export function detectPii(text: string): PiiMatch[] {
  const all = rules.flatMap((r) => r(text));
  all.sort((a, b) => priority[b.type] - priority[a.type] || b.end - b.start - (a.end - a.start));
  const kept: PiiMatch[] = [];
  for (const m of all) {
    const overlaps = kept.some((k) => m.start < k.end && k.start < m.end);
    // Broad line-level matches (address/medical) may contain precise ones; keep both.
    const lineLevel = m.type === 'address' || m.type === 'medical';
    if (!overlaps || lineLevel) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function summarizePii(matches: PiiMatch[]): Partial<Record<PiiType, number>> {
  const out: Partial<Record<PiiType, number>> = {};
  for (const m of matches) out[m.type] = (out[m.type] ?? 0) + 1;
  return out;
}
