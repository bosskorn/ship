import { detectPii, isValidLuhn, isValidThaiId, summarizePii } from '@/core/document-engine/redaction/piiDetector';
import { maskValue, redactText } from '@/core/document-engine/redaction/mask';

// 1-1017-00230-70-? : compute a valid checksum for fixtures.
function thaiId(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (sum % 11)) % 10);
}
const VALID_ID = thaiId('110170023070');
const VALID_TAX = thaiId('010555012345');

describe('Thai ID checksum', () => {
  it('accepts a valid ID and rejects a mutated one', () => {
    expect(isValidThaiId(VALID_ID)).toBe(true);
    const bad = VALID_ID.slice(0, 12) + String((Number(VALID_ID[12]) + 1) % 10);
    expect(isValidThaiId(bad)).toBe(false);
  });
});

describe('Luhn', () => {
  it('validates test card numbers', () => {
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
    expect(isValidLuhn('4111 1111 1111 1112')).toBe(false);
  });
});

describe('detectPii', () => {
  it('finds the spec example: ID + phone', () => {
    const text = `John Smith\n${VALID_ID}\n0812345678`;
    const types = detectPii(text).map((m) => m.type);
    expect(types).toEqual(['national_id', 'phone']);
  });

  it('handles formatted Thai ID', () => {
    const f = `${VALID_ID[0]}-${VALID_ID.slice(1, 5)}-${VALID_ID.slice(5, 10)}-${VALID_ID.slice(10, 12)}-${VALID_ID[12]}`;
    expect(detectPii(`เลขประจำตัวประชาชน ${f}`)[0]).toMatchObject({ type: 'national_id', value: f });
  });

  it('classifies juristic tax IDs', () => {
    expect(detectPii(`Tax ID ${VALID_TAX}`)[0].type).toBe('tax_id');
  });

  it('ignores 13-digit numbers with bad checksum', () => {
    const bad = VALID_ID.slice(0, 12) + String((Number(VALID_ID[12]) + 1) % 10);
    expect(detectPii(`Order ${bad}`).filter((m) => m.type === 'national_id')).toHaveLength(0);
  });

  it('detects email, card, bank account and +66 phone', () => {
    const text = 'Email: a.b@example.co.th Card 4111-1111-1111-1111 บัญชี 123-4-56789-0 Tel +66 81 234 5678';
    const s = summarizePii(detectPii(text));
    expect(s).toMatchObject({ email: 1, credit_card: 1, bank_account: 1, phone: 1 });
  });

  it('requires context for unformatted bank accounts and passports', () => {
    expect(detectPii('Ref 1234567890').some((m) => m.type === 'bank_account')).toBe(false);
    expect(detectPii('Account no. 1234567890').some((m) => m.type === 'bank_account')).toBe(true);
    expect(detectPii('Passport AA1234567').some((m) => m.type === 'passport')).toBe(true);
    expect(detectPii('SKU AA1234567').some((m) => m.type === 'passport')).toBe(false);
  });

  it('flags Thai addresses with postcode', () => {
    expect(detectPii('99 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900').some((m) => m.type === 'address')).toBe(true);
  });
});

describe('masking', () => {
  it('formats phones as 08X-XXX-XXXX', () => {
    expect(maskValue('phone', '0812345678')).toBe('08X-XXX-XXXX');
    expect(maskValue('phone', '+66 81 234 5678')).toBe('08X-XXX-XXXX');
  });

  it('fully blocks IDs and keeps card last 4', () => {
    expect(maskValue('national_id', VALID_ID)).toBe('█'.repeat(13));
    expect(maskValue('credit_card', '4111 1111 1111 1111')).toBe('████ ████ ████ 1111');
  });

  it('redacts text without touching the original', () => {
    const original = `ID ${VALID_ID} call 0812345678`;
    const out = redactText(original, detectPii(original));
    expect(out).toBe(`ID ${'█'.repeat(13)} call 08X-XXX-XXXX`);
    expect(original).toContain(VALID_ID);
  });

  it('can redact a subset of types', () => {
    const t = `ID ${VALID_ID} call 0812345678`;
    expect(redactText(t, detectPii(t), new Set(['phone']))).toBe(`ID ${VALID_ID} call 08X-XXX-XXXX`);
  });
});

describe('medical keyword', () => {
  it('matches hospital numbers but not names ending in "hn"', () => {
    expect(detectPii('John Smith').some((m) => m.type === 'medical')).toBe(false);
    expect(detectPii('HN: 12345').some((m) => m.type === 'medical')).toBe(true);
  });
});
