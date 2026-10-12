import { pageShape, qualityIssue, quadArea } from '@/core/document-engine/capture/qualityCoach';
import type { Quad } from '@/core/document-engine/model';
import { analyticsEvents } from '@/services/analytics/events';
import { CaptureQueue } from '@/features/scanner/captureQueue';
import { chooseEngine, MAX_ONESCAN_FAILURES } from '@/features/scanner/engine';

jest.mock('@/core/document-engine/ids', () => {
  let n = 0;
  return { newId: () => `id-${++n}` };
});
// eslint-disable-next-line import/first -- after the mock above
import { modeForDocType, useScanSession } from '@/features/scanner/scanSession';

const rect = (x0: number, y0: number, x1: number, y1: number): Quad => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('quality coach', () => {
  const page = rect(0.15, 0.15, 0.85, 0.85);
  it('reports the single most important issue', () => {
    expect(qualityIssue({ quad: null, hint: 'searching' })).toBe('NO_DOCUMENT');
    expect(qualityIssue({ quad: rect(0, 0.1, 0.8, 0.9), hint: 'ready' })).toBe('INCOMPLETE_EDGE');
    expect(qualityIssue({ quad: rect(0.4, 0.4, 0.6, 0.6), hint: 'ready' })).toBe('TOO_FAR');
    expect(qualityIssue({ quad: rect(0.02, 0.02, 0.98, 0.98), hint: 'ready' })).toBe('TOO_CLOSE');
    expect(qualityIssue({ quad: page, hint: 'too_dark' })).toBe('LOW_LIGHT');
    expect(qualityIssue({ quad: page, hint: 'blurry' })).toBe('BLUR');
    expect(qualityIssue({ quad: page, hint: 'hold_still' })).toBe('UNSTABLE');
    expect(qualityIssue({ quad: page, hint: 'ready' })).toBe('READY');
  });
  it('uses optional detectors only when they report', () => {
    expect(qualityIssue({ quad: page, hint: 'ready', glare: true })).toBe('GLARE');
    expect(qualityIssue({ quad: page, hint: 'ready', shadow: true })).toBe('SHADOW');
    // Framing beats reflections.
    expect(qualityIssue({ quad: rect(0.4, 0.4, 0.6, 0.6), hint: 'ready', glare: true })).toBe('TOO_FAR');
  });
  it('measures area', () => {
    expect(quadArea(rect(0, 0, 0.5, 0.5))).toBeCloseTo(0.25);
  });
  it('tells ID-1 cards from A4 pages and receipts by true aspect', () => {
    const frame = { width: 180, height: 240 };
    // Card 85.6×54 mm landscape in a portrait frame: 160×101 px.
    const card = rect(10 / 180, 60 / 240, 170 / 180, 161 / 240);
    expect(pageShape(card, frame)).toBe('card');
    // A4 portrait 140×198 px.
    expect(pageShape(rect(20 / 180, 20 / 240, 160 / 180, 218 / 240), frame)).toBe('page');
    // Receipt 60×200 px.
    expect(pageShape(rect(60 / 180, 20 / 240, 120 / 180, 220 / 240), frame)).toBe('long');
  });
});

describe('scanner engine choice', () => {
  const both = { onescan: true, google: true };
  const healthy = { opening: false, failures: 0 };
  it('defaults to OneScan in Auto', () => {
    expect(chooseEngine('auto', true, both, healthy)).toEqual({ engine: 'onescan' });
  });
  it('falls back to the system scanner when OneScan is off, missing or crashing', () => {
    expect(chooseEngine('auto', false, both, healthy)).toEqual({ engine: 'google', fallbackReason: 'disabled' });
    expect(chooseEngine('auto', true, { onescan: false, google: true }, healthy)).toEqual({ engine: 'google', fallbackReason: 'unsupported' });
    expect(chooseEngine('auto', true, both, { opening: true, failures: MAX_ONESCAN_FAILURES - 1 })).toEqual({ engine: 'google', fallbackReason: 'crashed' });
    expect(chooseEngine('auto', true, both, { opening: true, failures: 0 })).toEqual({ engine: 'onescan' });
  });
  it('honours an explicit choice and never strands the user', () => {
    expect(chooseEngine('google', true, both, healthy).engine).toBe('google');
    expect(chooseEngine('onescan', false, both, { opening: true, failures: 9 }).engine).toBe('onescan');
    expect(chooseEngine('google', true, { onescan: true, google: false }, healthy).engine).toBe('onescan');
    expect(chooseEngine('auto', true, { onescan: false, google: false }, healthy).engine).toBeNull();
  });
});

describe('capture queue', () => {
  it('runs jobs one at a time, in order, past failures', async () => {
    const q = new CaptureQueue();
    const log: string[] = [];
    let running = 0;
    const job = (name: string, fail = false) => async () => {
      running++;
      expect(running).toBe(1);
      await new Promise((r) => setTimeout(r, 5));
      log.push(name);
      running--;
      if (fail) throw new Error(name);
    };
    const sizes: number[] = [];
    q.subscribe((n) => sizes.push(n));
    void q.enqueue(job('a'));
    const b = q.enqueue(job('b', true));
    void q.enqueue(job('c'));
    expect(q.size).toBe(3);
    await expect(b).rejects.toThrow('b');
    await q.idle();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(q.size).toBe(0);
    expect(sizes[sizes.length - 1]).toBe(0);
  });
});

describe('scan session (Phase 1)', () => {
  it('starts single-page in Auto, maps tools to modes', () => {
    useScanSession.getState().start();
    expect(useScanSession.getState()).toMatchObject({ mode: 'auto', docType: 'document', multi: false });
    useScanSession.getState().start({ docType: 'receipt' });
    expect(useScanSession.getState().mode).toBe('receipt');
    expect(modeForDocType('book')).toBe('document');
    expect(modeForDocType('id_card')).toBe('id');
  });
  it('replaces a processing page by id, ignoring pages removed meanwhile', () => {
    const s = useScanSession.getState();
    s.start();
    const base = { sourceUri: 'file:///raw.jpg', processedUri: 'file:///raw.jpg', width: 3000, height: 4000, filter: 'auto' as const, rotation: 0 as const };
    s.addPage({ id: 'p1', ...base, processing: true });
    s.addPage({ id: 'p2', ...base, processing: true });
    s.updatePage('p2', { processedUri: 'file:///preview.jpg', width: 1200, height: 1600, processing: false });
    s.removePage(0);
    s.updatePage('p1', { processing: false });
    const pages = useScanSession.getState().pages;
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ id: 'p2', processedUri: 'file:///preview.jpg', processing: false, sourceUri: 'file:///raw.jpg' });
  });
});

describe('analytics', () => {
  it('has the Phase 1 scanner events', () => {
    for (const e of ['scanner_open', 'capture_success', 'capture_failed', 'engine_fallback', 'hd_used', 'max_used', 'multipage_used']) {
      expect(analyticsEvents).toContain(e);
    }
  });
});
