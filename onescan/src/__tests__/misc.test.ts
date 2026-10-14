import { buildPdfHtml } from '@/core/document-engine/pdf/pdfHtml';
import { base64ToBytes, bytesToBase64 } from '@/core/document-engine/security/SecurityEngine';
import { resolveLanguage } from '@/core/i18n/languages';
import en from '@/core/i18n/locales/en';
import th from '@/core/i18n/locales/th';

describe('pdf html', () => {
  it('emits one A4 section per page with CSS filter fallback', () => {
    const html = buildPdfHtml(
      [
        { dataUri: 'data:image/jpeg;base64,AAA', width: 10, height: 10, filter: 'bw', rotation: 0, filterApplied: false },
        { dataUri: 'data:image/jpeg;base64,BBB', width: 10, height: 10, filter: 'bw', rotation: 90, filterApplied: true },
      ],
      'T<i>tle',
    );
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html).toContain('grayscale(1) contrast(2.2)');
    expect(html).toContain('filter:none;');
    expect(html).toContain('T&lt;i>tle');
  });
});

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff));
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
    expect(bytesToBase64(new TextEncoder().encode('hi!'))).toBe('aGkh');
  });
});

describe('i18n', () => {
  it('resolves supported languages with fallback', () => {
    expect(resolveLanguage(['th-TH', 'en-US'])).toBe('th');
    expect(resolveLanguage(['ja-JP'])).toBe('en');
  });

  it('th has exactly the same keys as en', () => {
    const keys = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : keys(v, `${p}${k}.`)));
    expect(keys(th).sort()).toEqual(keys(en).sort());
  });

  it('has no empty strings', () => {
    const vals = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : vals(v)));
    expect([...vals(en), ...vals(th)].every((v) => v.trim().length > 0)).toBe(true);
  });
});
