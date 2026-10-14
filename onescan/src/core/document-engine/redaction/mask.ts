import type { PiiMatch, PiiType } from './piiDetector';

const BLOCK = '█';

/**
 * Mask a single value. Formats follow spec §18:
 *   name/ID → full block, phone → "08X-XXX-XXXX".
 */
export function maskValue(type: PiiType, value: string): string {
  switch (type) {
    case 'phone': {
      const d = value.replace(/\D/g, '');
      const local = d.startsWith('66') ? `0${d.slice(2)}` : d;
      const prefix = local.slice(0, 2);
      return local.length === 10 ? `${prefix}X-XXX-XXXX` : `${prefix}X-XXX-XXX`;
    }
    case 'email': {
      const at = value.indexOf('@');
      return at > 0 ? `${value[0]}${'•'.repeat(Math.max(3, at - 1))}${value.slice(at)}` : BLOCK.repeat(value.length);
    }
    case 'credit_card': {
      const last4 = value.replace(/\D/g, '').slice(-4);
      return `████ ████ ████ ${last4}`;
    }
    default:
      // Preserve separators/line breaks so layout is stable.
      return value.replace(/[^\s\-/]/g, BLOCK);
  }
}

/** Produce redacted text. The original string is never mutated. */
export function redactText(text: string, matches: PiiMatch[], only?: Set<PiiType>): string {
  const selected = matches
    .filter((m) => !only || only.has(m.type))
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const m of selected) {
    if (m.start < cursor) continue; // nested inside a previous redaction
    out += text.slice(cursor, m.start) + maskValue(m.type, text.slice(m.start, m.end));
    cursor = m.end;
  }
  return out + text.slice(cursor);
}
