import { matchSnippet, queryTerms } from '@/features/search/snippet';

describe('search snippet (UI layer, from OCR text)', () => {
  it('finds a Thai term without spaces and splits around it', () => {
    const s = matchSnippet('การไฟฟ้านครหลวง ใบแจ้งค่าไฟฟ้า ประจำเดือนตุลาคม 2569', 'ค่าไฟ');
    expect(s?.match).toBe('ค่าไฟ');
    expect(`${s?.before}${s?.match}${s?.after}`).toContain('ใบแจ้งค่าไฟฟ้า');
  });

  it('is case-insensitive and keeps the original casing', () => {
    expect(matchSnippet('Total ELECTRICITY charge', 'electricity')?.match).toBe('ELECTRICITY');
  });

  it('adds ellipses only when text was cut', () => {
    const long = `${'a '.repeat(80)}needle${' b'.repeat(80)}`;
    const s = matchSnippet(long, 'needle', 10)!;
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
    expect(matchSnippet('needle here', 'needle')!.before).toBe('');
  });

  it('ignores operator words and returns null when nothing matches', () => {
    expect(queryTerms('type:receipt invoice OR bill')).toEqual(['invoice', 'bill']);
    expect(matchSnippet('nothing relevant', 'invoice')).toBeNull();
    expect(matchSnippet('', 'x')).toBeNull();
  });
});
