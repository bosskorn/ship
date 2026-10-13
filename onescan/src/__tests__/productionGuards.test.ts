import { MAX_SCAN_PAGES, useScanSession } from '@/features/scanner/scanSession';
import { OCREngine } from '@/core/document-engine/ocr/OCREngine';

const mockRecognize = jest.fn();
jest.mock('@/native/OneScanVision', () => ({ OneScanVision: { recognizeTextAsync: (...a: unknown[]) => mockRecognize(...a) } }));

const page = (i: number) => ({ id: `p${i}`, sourceUri: `file:///p${i}.jpg`, processedUri: `file:///p${i}.jpg`, width: 10, height: 10, filter: 'auto' as const, rotation: 0 as const });

describe('production guards', () => {
  it('caps a document at MAX_SCAN_PAGES pages (camera, import, duplicate)', () => {
    const s = useScanSession.getState();
    s.start();
    for (let i = 0; i < MAX_SCAN_PAGES + 5; i++) useScanSession.getState().addPage(page(i));
    expect(useScanSession.getState().pages).toHaveLength(MAX_SCAN_PAGES);
    useScanSession.getState().duplicatePage(0);
    expect(useScanSession.getState().pages).toHaveLength(MAX_SCAN_PAGES);
  });

  it('OCR is best-effort: a failing page is saved without text, the rest keep theirs', async () => {
    mockRecognize.mockReset();
    mockRecognize
      .mockResolvedValueOnce([{ text: 'สวัสดี hello', box: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.9 }])
      .mockRejectedValueOnce(new Error('Tesseract init failed'))
      .mockResolvedValueOnce([{ text: 'page three', box: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.9 }]);
    const r = await OCREngine.recognize(['a', 'b', 'c']);
    expect(r.available).toBe(true);
    expect(r.failedPages).toBe(1);
    expect(r.pages.map((p) => p.text)).toEqual(['สวัสดี hello', '', 'page three']);
  });

  it('OCR failing on every page still resolves (the save goes ahead without text)', async () => {
    mockRecognize.mockReset();
    mockRecognize.mockRejectedValue(new Error('boom'));
    const r = await OCREngine.recognize(['a', 'b']);
    expect(r).toMatchObject({ available: false, failedPages: 2, text: '\n\n' });
  });
});

import { chooseEngine, FAILURE_MEMORY_MS, recentFailures } from '@/features/scanner/engine';

describe('scanner crash guard', () => {
  const both = { onescan: true, google: true };
  it('falls back to Google only after repeated recent start failures', () => {
    const now = Date.now();
    expect(chooseEngine('auto', true, both, { opening: false, failures: 1, lastFailureAt: now }).engine).toBe('onescan');
    expect(chooseEngine('auto', true, both, { opening: false, failures: 2, lastFailureAt: now }).engine).toBe('google');
    // a start that never finished (app died while opening) counts once
    expect(chooseEngine('auto', true, both, { opening: true, failures: 1, lastFailureAt: now }).engine).toBe('google');
  });
  it('forgets failures after a week', () => {
    const old = Date.now() - FAILURE_MEMORY_MS - 1000;
    expect(recentFailures({ opening: false, failures: 5, lastFailureAt: old })).toBe(0);
    expect(chooseEngine('auto', true, both, { opening: false, failures: 5, lastFailureAt: old }).engine).toBe('onescan');
  });
  it('honours an explicit engine choice', () => {
    expect(chooseEngine('onescan', true, both, { opening: false, failures: 9, lastFailureAt: Date.now() }).engine).toBe('onescan');
  });
});
