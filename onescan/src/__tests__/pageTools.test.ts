/** Phase B: shared page operations, split planning, page service and image export. */
import { compactPages, displayTurn, duplicateAt, insertAt, MAX_DOCUMENT_PAGES, movePage, PageItem, parseRanges, removeAt, roomFor, slotAt, turn } from '@/core/document-engine/pages/pageOps';
import { planSplit } from '@/features/pages/splitPlan';
import type { DraftPage } from '@/core/document-engine/model';

let mockSeq = 0;
jest.mock('@/core/document-engine/ids', () => ({ newId: () => `id-${++mockSeq}` }));
const mockEngine = {
  draftsFor: jest.fn(async (): Promise<DraftPage[]> => [page('s1'), page('s2')]),
  reprocess: jest.fn(async (p: DraftPage, patch: { rotation?: number }) => ({ ...p, rotation: patch.rotation ?? p.rotation, processedUri: `${p.processedUri}#r${patch.rotation}` })),
  save: jest.fn(async () => ({ id: 'new-doc' })),
  saveEdits: jest.fn(async () => ({ id: 'edited' })),
  processScanned: jest.fn(async (uri: string) => ({ ...page(uri), filter: 'original' })),
  processCapture: jest.fn(async (uri: string) => ({ ...page(uri), filter: 'auto' })),
};
jest.mock('@/core/document-engine/DocumentEngine', () => ({ DocumentEngine: mockEngine, PDF_RENDER_WIDTH: 2480 }));
jest.mock('@/native/OneScanVision', () => ({ OneScanVision: null }));
function page(id: string): DraftPage {
  return { id, sourceUri: `file:///src/${id}.jpg`, processedUri: `file:///prev/${id}.jpg`, width: 100, height: 141, filter: 'auto', rotation: 0 };
}

/* eslint-disable @typescript-eslint/no-require-imports -- after the mocks above */
const { DocumentPageService, PageLimitError } = require('@/core/document-engine/services/DocumentPageService') as typeof import('@/core/document-engine/services/DocumentPageService');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => jest.clearAllMocks());

describe('page operations (shared by every page tool and the scan Review)', () => {
  const l = ['a', 'b', 'c', 'd'];
  it('move, remove, duplicate, insert never mutate the input', () => {
    expect(movePage(l, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(movePage(l, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(movePage(l, 1, 9)).toEqual(l);
    expect(removeAt(l, [0, 2])).toEqual(['b', 'd']);
    expect(duplicateAt(l, 1, (x) => `${x}'`)).toEqual(['a', 'b', "b'", 'c', 'd']);
    expect(insertAt(l, 2, ['x', 'y'])).toEqual(['a', 'b', 'x', 'y', 'c', 'd']);
    expect(insertAt(l, 99, ['z'])).toEqual([...l, 'z']);
    expect(l).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rotation turns both ways and the preview turn follows what is baked in', () => {
    expect(turn(0, -90)).toBe(270);
    expect(turn(270, 90)).toBe(0);
    const it: PageItem = { key: 'k', page: { ...page('p'), rotation: 90 }, previewRotation: 0 };
    expect(displayTurn(it)).toBe(90);
    expect(displayTurn({ ...it, previewRotation: 180 })).toBe(270);
  });

  it('page ranges as people type them', () => {
    expect(parseRanges('1-3, 7-10', 12)).toEqual({ ranges: [[0, 2], [6, 9]] });
    expect(parseRanges('2–4 6', 6)).toEqual({ ranges: [[1, 3], [5, 5]] });
    expect(parseRanges('5', 5)).toEqual({ ranges: [[4, 4]] });
    expect(parseRanges('  ', 5)).toEqual({ error: 'empty' });
    expect(parseRanges('1-a', 5)).toEqual({ error: 'syntax' });
    expect(parseRanges('0-2', 5)).toEqual({ error: 'out_of_range' });
    expect(parseRanges('4-9', 5)).toEqual({ error: 'out_of_range' });
    expect(parseRanges('4-2', 5)).toEqual({ error: 'reversed' });
  });

  it('drag target slot from a point in a 3-column grid', () => {
    const cell = { width: 100, height: 160 };
    expect(slotAt(10, 10, cell, 3, 7)).toBe(0);
    expect(slotAt(250, 10, cell, 3, 7)).toBe(2);
    expect(slotAt(150, 170, cell, 3, 7)).toBe(4);
    expect(slotAt(290, 900, cell, 3, 7)).toBe(6);
    expect(slotAt(-50, -50, cell, 3, 7)).toBe(0);
    expect(roomFor(MAX_DOCUMENT_PAGES - 3)).toBe(3);
    expect(roomFor(MAX_DOCUMENT_PAGES + 2)).toBe(0);
  });
});

describe('split plan (shown before anything is written)', () => {
  it('every page, selected pages, ranges', () => {
    expect(compactPages([7, 1, 2, 3, 9, 10])).toBe('1-3,7,9-10');
    const all = planSplit('all', { title: 'Lease', pageCount: 3 });
    expect(all).toEqual({ parts: [{ pages: [0], title: 'Lease_p1' }, { pages: [1], title: 'Lease_p2' }, { pages: [2], title: 'Lease_p3' }] });
    expect(planSplit('select', { title: 'Lease', pageCount: 5, selected: [4, 0, 1] })).toEqual({ parts: [{ pages: [0, 1, 4], title: 'Lease_p1-2,5' }] });
    expect(planSplit('select', { title: 'Lease', pageCount: 5, selected: [] })).toEqual({ error: 'select_some' });
    expect(planSplit('ranges', { title: 'Lease', pageCount: 10, ranges: '1-3, 7-10' })).toEqual({
      parts: [{ pages: [0, 1, 2], title: 'Lease_p1-3' }, { pages: [6, 7, 8, 9], title: 'Lease_p7-10' }],
    });
    expect(planSplit('ranges', { title: 'Lease', pageCount: 3, ranges: '2-5' })).toEqual({ error: 'out_of_range' });
  });
});

describe('DocumentPageService', () => {
  it('loads a document as page items tagged with their source', async () => {
    const items = await DocumentPageService.fromDocument({ id: 'doc-A' });
    expect(items.map((i) => [i.page.id, i.sourceDocumentId, i.previewRotation])).toEqual([['s1', 'doc-A', 0], ['s2', 'doc-A', 0]]);
    const copy = DocumentPageService.copy(items[0]);
    expect(copy.key).not.toBe(items[0].key);
    expect(copy.page.id).not.toBe(items[0].page.id);
    expect(copy.page.sourceUri).toBe(items[0].page.sourceUri);
  });

  it('Images → PDF keeps photos as they are (no edge detection, original filter)', async () => {
    const items = await DocumentPageService.fromImages(['file:///a.jpg', 'file:///b.jpg']);
    expect(mockEngine.processScanned).toHaveBeenCalledWith('file:///a.jpg', 'original');
    expect(mockEngine.processCapture).not.toHaveBeenCalled();
    expect(items).toHaveLength(2);
  });

  it('a new document re-renders only stale previews and never edits the sources', async () => {
    const [a, b] = await DocumentPageService.fromDocument({ id: 'doc-A' });
    const rotated = DocumentPageService.rotate(a, 90);
    const doc = await DocumentPageService.saveAsNew([rotated, b], { title: 'Merged', docType: 'document' });
    expect(doc).toEqual({ id: 'new-doc' });
    expect(mockEngine.reprocess).toHaveBeenCalledTimes(1);
    expect(mockEngine.reprocess).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), { rotation: 90 });
    const drafts = (mockEngine.save.mock.calls[0] as unknown[])[0] as DraftPage[];
    expect(drafts.map((d) => [d.id, d.rotation])).toEqual([['s1', 90], ['s2', 0]]);
    expect(mockEngine.saveEdits).not.toHaveBeenCalled();
  });

  it('page limit and empty documents are refused before any work', async () => {
    const [a] = await DocumentPageService.fromDocument({ id: 'doc-A' });
    const many = Array.from({ length: MAX_DOCUMENT_PAGES + 1 }, () => DocumentPageService.copy(a));
    await expect(DocumentPageService.saveAsNew(many, { title: 'x', docType: 'document' })).rejects.toBeInstanceOf(PageLimitError);
    await expect(DocumentPageService.saveAsNew([], { title: 'x', docType: 'document' })).rejects.toThrow();
    expect(mockEngine.save).not.toHaveBeenCalled();
  });

  it('Manage pages saves back into that document', async () => {
    const items = await DocumentPageService.fromDocument({ id: 'doc-A' });
    await DocumentPageService.saveInto({ id: 'doc-A' } as never, [items[1], items[0]]);
    const drafts = (mockEngine.saveEdits.mock.calls[0] as unknown[])[1] as DraftPage[];
    expect(drafts.map((d) => d.id)).toEqual(['s2', 's1']);
  });
});
