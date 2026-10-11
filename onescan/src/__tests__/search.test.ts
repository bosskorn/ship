import { monthRange, normalizeYear, parseSearchQuery, toFtsMatch } from '@/core/database/searchQuery';

describe('parseSearchQuery', () => {
  it('parses "invoice October"', () => {
    expect(parseSearchQuery('invoice October')).toEqual({ terms: ['invoice'], month: 10, docTypes: ['invoice'] });
  });

  it('parses Thai month and Buddhist-era year', () => {
    const q = parseSearchQuery('ใบเสร็จ ตุลาคม 2569');
    expect(q).toMatchObject({ month: 10, year: 2026, docTypes: ['receipt'], terms: ['ใบเสร็จ'] });
  });

  it('converts BE years', () => {
    expect(normalizeYear(2569)).toBe(2026);
    expect(normalizeYear(2026)).toBe(2026);
  });
});

describe('toFtsMatch', () => {
  it('quotes and prefix-matches terms, stripping quotes', () => {
    expect(toFtsMatch(['inv', 'a"b'])).toBe('"inv"* OR "ab"*');
    expect(toFtsMatch([])).toBeNull();
  });
});

describe('monthRange', () => {
  it('spans exactly one month', () => {
    const [a, b] = monthRange(2026, 12);
    expect(new Date(a).getMonth()).toBe(11);
    expect(new Date(b).getFullYear()).toBe(2027);
  });
});
