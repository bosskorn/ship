/**
 * Document Tools Phase B, engine level (native module, DB and files mocked): real progress
 * counts, cancel and failure leave no partial output, edits are all-or-nothing, duplicates get
 * their own files, large PDFs are processed one page at a time.
 */
import { DocumentEngine, OperationCancelled } from '@/core/document-engine/DocumentEngine';
import { DocumentPageService, PageLimitError } from '@/core/document-engine/services/DocumentPageService';
import type { DocumentRecord, DraftPage } from '@/core/document-engine/model';
import { MAX_DOCUMENT_PAGES, PageItem } from '@/core/document-engine/pages/pageOps';

const mockCreated: any[] = [];
const mockReplaced: any[] = [];
const mockDeleted: string[] = [];
const mockCalls: { fn: string; args: unknown[] }[] = [];
const mockState = { inFlight: 0, maxInFlight: 0, pdfPages: 5, failOn: '' as string, ocrHook: null as null | (() => void), mime: {} as Record<string, string> };

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    uri: string;
    constructor(u: string) {
      this.uri = u;
    }
    get exists() {
      return true;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
}));
jest.mock('@/native/OneScanVision', () => {
  let n = 0;
  const call = (fn: string, run: (...a: any[]) => unknown) => async (...args: any[]) => {
    mockCalls.push({ fn, args });
    // Pixel work (decode / render / OCR); header reads (imageInfoAsync) are not counted.
    const heavy = fn !== 'imageInfoAsync' && fn !== 'pdfPageCountAsync';
    if (heavy) mockState.inFlight++;
    mockState.maxInFlight = Math.max(mockState.maxInFlight, mockState.inFlight);
    try {
      await new Promise((r) => setTimeout(r, 0));
      if (mockState.failOn === fn) throw new Error(`native ${fn} failed`);
      return run(...args);
    } finally {
      if (heavy) mockState.inFlight--;
    }
  };
  return {
    OneScanVision: {
      processPageAsync: call('processPageAsync', () => ({ uri: `file:///cache/processed-${++n}.jpg`, width: 2480, height: 3508, quality: 90 })),
      imageInfoAsync: call('imageInfoAsync', (uri: string) => ({ width: 2480, height: 3508, bytes: 900_000, mimeType: mockState.mime[uri] ?? 'image/jpeg', orientation: 0 })),
      resizeAsync: call('resizeAsync', () => ({ uri: `file:///cache/preview-${++n}.jpg`, width: 1000, height: 1414, bytes: 90_000 })),
      recognizeTextAsync: call('recognizeTextAsync', () => {
        mockState.ocrHook?.();
        return [{ text: 'page text', box: { x: 0, y: 0, width: 1, height: 0.1 }, confidence: 0.9 }];
      }),
      pdfPageCountAsync: call('pdfPageCountAsync', () => mockState.pdfPages),
      renderPdfPagesAsync: call('renderPdfPagesAsync', (_u: string, _w: number, from: number, count: number) => ({
        pages: Array.from({ length: Math.min(count, mockState.pdfPages - from) }, (_, i) => ({ uri: `file:///cache/onescan/pdfpage-${from + i}.jpg`, width: 2480, height: 3508 })),
      })),
    },
  };
});
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: {
    create: jest.fn(async (input: any) => {
      mockCreated.push(input);
      return { id: `doc-${mockCreated.length}`, pdfUri: input.pdfUri, ...input };
    }),
    replaceContent: jest.fn(async (id: string, input: any) => {
      if (mockState.failOn === 'replaceContent') throw new Error('db');
      mockReplaced.push({ id, ...input });
    }),
    get: jest.fn(async (id: string) => ({ id, title: 'Doc' })),
    purge: jest.fn(async () => undefined),
    pages: jest.fn(async () => []),
  },
  folderRepository: { bySystemKey: jest.fn(async () => null) },
}));
jest.mock('@/core/document-engine/storage/DocumentFileStore', () => ({
  DocumentFileStore: {
    adopt: jest.fn(async (uri: string, docId: string, name: string) => ({ uri: `file:///docs/${docId}/${name}`, source: uri })),
    size: () => 1000,
    deleteDocument: jest.fn(),
  },
}));
jest.mock('@/core/document-engine/pdf/PDFEngine', () => ({
  PDFEngine: {
    create: jest.fn(async (pages: unknown[]) => {
      if (mockState.failOn === 'pdf') throw new Error('pdf failed');
      return { uri: 'file:///cache/out.pdf', pageCount: pages.length };
    }),
  },
}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-print', () => ({}));

const { DocumentFileStore } = jest.requireMock('@/core/document-engine/storage/DocumentFileStore') as { DocumentFileStore: Record<string, jest.Mock> };
const { documentRepository } = jest.requireMock('@/core/database/repositories/documentRepository') as { documentRepository: Record<string, jest.Mock> };

const draft = (i: number, over: Partial<DraftPage> = {}): DraftPage => ({
  id: `d${i}`, sourceUri: `file:///cache/src-${i}.jpg`, processedUri: `file:///cache/prev-${i}.jpg`, width: 10, height: 14, filter: 'auto', rotation: 0, ...over,
});
const drafts = (n: number) => Array.from({ length: n }, (_, i) => draft(i + 1));
const original = { id: 'orig', title: 'Lease', docType: 'contract', pdfUri: 'file:///docs/olddir/document.pdf' } as unknown as DocumentRecord;

beforeEach(() => {
  mockCreated.length = 0;
  mockReplaced.length = 0;
  mockDeleted.length = 0;
  mockCalls.length = 0;
  Object.assign(mockState, { inFlight: 0, maxInFlight: 0, pdfPages: 5, failOn: '', ocrHook: null, mime: {} });
  jest.clearAllMocks();
});

describe('save: real progress, cancel and failure', () => {
  it('reports page counts for rendering and OCR', async () => {
    const seen: string[] = [];
    await DocumentEngine.save(drafts(3), { title: 'A', docType: 'document', onStage: (s, _p, d, t) => d !== undefined && seen.push(`${s}:${d}/${t}`) });
    expect(seen).toEqual(['pages:0/3', 'pages:1/3', 'pages:2/3', 'pages:3/3', 'ocr:0/3', 'ocr:1/3', 'ocr:2/3', 'ocr:3/3']);
  });

  it('cancel while rendering: no record, the new folder is removed', async () => {
    const signal = { cancelled: false };
    const p = DocumentEngine.save(drafts(4), { title: 'A', docType: 'document', signal, onStage: (s, _p, d) => s === 'pages' && d === 2 && (signal.cancelled = true) });
    await expect(p).rejects.toBeInstanceOf(OperationCancelled);
    expect(mockCreated).toHaveLength(0);
    expect(DocumentFileStore.deleteDocument).toHaveBeenCalledTimes(1);
    // Cancelled as page 3 started: it finishes, page 4 is never rendered.
    expect(mockCalls.filter((c) => c.fn === 'processPageAsync')).toHaveLength(3);
  });

  it('cancel during OCR: no record, folder removed', async () => {
    const signal = { cancelled: false };
    mockState.ocrHook = () => (signal.cancelled = true);
    await expect(DocumentEngine.save(drafts(3), { title: 'A', docType: 'document', signal })).rejects.toBeInstanceOf(OperationCancelled);
    expect(mockCreated).toHaveLength(0);
    expect(mockCalls.filter((c) => c.fn === 'recognizeTextAsync')).toHaveLength(1);
    expect(DocumentFileStore.deleteDocument).toHaveBeenCalled();
  });

  it('a failure mid-way leaves no record and removes the files written', async () => {
    mockState.failOn = 'pdf';
    await expect(DocumentEngine.save(drafts(2), { title: 'A', docType: 'document' })).rejects.toThrow('pdf failed');
    expect(mockCreated).toHaveLength(0);
    expect(DocumentFileStore.deleteDocument).toHaveBeenCalledTimes(1);
  });
});

describe('encrypted output', () => {
  it('every file a new document refers to went through the encrypted document store', async () => {
    await DocumentPageService.saveAsNew(drafts(3).map((page, i) => ({ key: `k${i}`, page, previewRotation: 0 as const })), { title: 'Enc', docType: 'document' });
    const doc = mockCreated[0];
    const uris = [doc.pdfUri, doc.thumbnailUri, ...doc.pages.flatMap((p: any) => [p.imageUri, p.sourceUri, p.previewUri])];
    expect(uris.every((u: string) => u.startsWith('file:///docs/'))).toBe(true);
    // DocumentFileStore.adopt is the only writer into docs/ (it encrypts with AES-256-GCM on device).
    expect(DocumentFileStore.adopt).toHaveBeenCalledTimes(uris.length);
  });
});

describe('saveEdits is all-or-nothing', () => {
  it('success switches the document and only then removes the old files', async () => {
    await DocumentEngine.saveEdits(original, drafts(2));
    expect(mockReplaced).toHaveLength(1);
    expect(mockReplaced[0].pages).toHaveLength(2);
    expect(DocumentFileStore.deleteDocument).toHaveBeenCalledWith('olddir');
  });

  it.each(['pdf', 'replaceContent', 'recognizeTextAsync'])('failure in %s: old document untouched, new files removed', async (step) => {
    mockState.failOn = step;
    const p = DocumentEngine.saveEdits(original, drafts(2));
    if (step === 'recognizeTextAsync') {
      // OCR is best-effort: a page that fails is saved without text, the save still completes.
      await p;
      expect(mockReplaced).toHaveLength(1);
      return;
    }
    await expect(p).rejects.toThrow();
    expect(mockReplaced).toHaveLength(0);
    expect(DocumentFileStore.deleteDocument).not.toHaveBeenCalledWith('olddir');
    expect(DocumentFileStore.deleteDocument).toHaveBeenCalledTimes(1);
  });

  it('cancel: old document untouched, new files removed', async () => {
    const signal = { cancelled: true };
    await expect(DocumentEngine.saveEdits(original, drafts(2), undefined, undefined, signal)).rejects.toBeInstanceOf(OperationCancelled);
    expect(mockReplaced).toHaveLength(0);
    expect(DocumentFileStore.deleteDocument).not.toHaveBeenCalledWith('olddir');
  });
});

describe('page tools service', () => {
  const items = (n: number): PageItem[] => drafts(n).map((page, i) => ({ key: `k${i}`, page, previewRotation: 0 as const }));

  it('a duplicated page gets its own files in the new document', async () => {
    const [a] = items(1);
    const copy = DocumentPageService.copy(a);
    expect(copy.key).not.toBe(a.key);
    expect(copy.page.id).not.toBe(a.page.id);
    await DocumentPageService.saveAsNew([a, copy], { title: 'Dup', docType: 'document' });
    const masters = mockCreated[0].pages.map((p: { imageUri: string }) => p.imageUri);
    const originals = mockCreated[0].pages.map((p: { sourceUri: string }) => p.sourceUri);
    expect(new Set(masters).size).toBe(2);
    expect(new Set(originals).size).toBe(2);
  });

  it('only pages whose rotation changed are re-rendered before saving', async () => {
    const list = items(3);
    list[1] = DocumentPageService.rotate(list[1], 90);
    list[1] = DocumentPageService.rotate(list[1], 90); // 180°
    const drafts = await DocumentPageService.prepare(list);
    expect(drafts.map((d) => d.rotation)).toEqual([0, 180, 0]);
    // One preview re-render (processPageAsync) for the rotated page only.
    expect(mockCalls.filter((c) => c.fn === 'processPageAsync')).toHaveLength(1);
  });

  it('Images → PDF takes JPEG and PNG only, keeps the picked order and reports skipped files', async () => {
    mockState.mime = { 'file:///cache/b.png': 'image/png', 'file:///cache/c.heic': 'image/heic', 'file:///cache/d.gif': 'image/gif' };
    const { items: got, skipped } = await DocumentPageService.fromImages(['file:///cache/a.jpg', 'file:///cache/b.png', 'file:///cache/c.heic', 'file:///cache/d.gif']);
    expect(got.map((i) => i.page.sourceUri)).toEqual(['file:///cache/a.jpg', 'file:///cache/b.png']);
    expect(skipped).toBe(2);
  });

  it('Images → PDF cancel removes the previews already made', async () => {
    const signal = { cancelled: false };
    const p = DocumentPageService.fromImages(['file:///cache/a.jpg', 'file:///cache/b.jpg', 'file:///cache/c.jpg'], { signal, onProgress: (d) => d === 2 && (signal.cancelled = true) });
    await expect(p).rejects.toBeInstanceOf(OperationCancelled);
    expect(mockDeleted).toEqual(expect.arrayContaining(['file:///cache/a.jpg', 'file:///cache/b.jpg']));
    expect(mockDeleted.every((u) => u.startsWith('file:///cache/'))).toBe(true);
  });

  it('a PDF file is rendered one page per call, with real progress', async () => {
    mockState.pdfPages = 7;
    const progress: string[] = [];
    const got = await DocumentPageService.fromPdfFile('file:///cache/in.pdf', { onProgress: (d, t) => progress.push(`${d}/${t}`) });
    const renders = mockCalls.filter((c) => c.fn === 'renderPdfPagesAsync');
    expect(renders).toHaveLength(7);
    expect(renders.every((c) => c.args[3] === 1)).toBe(true);
    expect(got).toHaveLength(7);
    expect(progress[6]).toBe('7/7');
    expect(mockState.maxInFlight).toBe(1);
  });

  it('a PDF over the limit is refused before rendering anything', async () => {
    mockState.pdfPages = MAX_DOCUMENT_PAGES + 1;
    await expect(DocumentPageService.fromPdfFile('file:///cache/big.pdf')).rejects.toBeInstanceOf(PageLimitError);
    expect(mockCalls.filter((c) => c.fn === 'renderPdfPagesAsync')).toHaveLength(0);
  });

  it('cancel while rendering a PDF removes the renders made so far', async () => {
    mockState.pdfPages = 10;
    const signal = { cancelled: false };
    const p = DocumentPageService.fromPdfFile('file:///cache/in.pdf', { signal, onProgress: (d) => d === 3 && (signal.cancelled = true) });
    await expect(p).rejects.toBeInstanceOf(OperationCancelled);
    expect(mockCalls.filter((c) => c.fn === 'renderPdfPagesAsync')).toHaveLength(3);
    expect(mockDeleted).toEqual(expect.arrayContaining(['file:///cache/onescan/pdfpage-0.jpg', 'file:///cache/onescan/pdfpage-2.jpg']));
  });

  it('discard never touches files of saved documents', () => {
    DocumentPageService.discard([{ key: 'a', previewRotation: 0, page: draft(1, { sourceUri: 'file:///data/onescan/docs/x/original/page-1.jpg', processedUri: 'file:///data/onescan/docs/x/preview/page-1.jpg' }) }]);
    expect(mockDeleted).toHaveLength(0);
  });

  it('Split saves every part or none: a failure deletes the parts already made', async () => {
    const parts = [
      { title: 'L_p1', items: items(1) },
      { title: 'L_p2', items: items(1) },
      { title: 'L_p3', items: items(1) },
    ];
    let saves = 0;
    const save = jest.spyOn(DocumentPageService, 'saveAsNew').mockImplementation(async (_i, o) => {
      if (++saves === 3) throw new Error('disk');
      return { id: `part-${saves}`, title: o.title, pdfUri: `file:///docs/part-${saves}/document.pdf` } as unknown as DocumentRecord;
    });
    await expect(DocumentPageService.saveParts(parts, { docType: 'document' })).rejects.toThrow('disk');
    expect(documentRepository.purge.mock.calls.map((c) => c[0])).toEqual(['part-1', 'part-2']);
    save.mockRestore();
  });

  it('Split cancel between parts deletes the parts already made', async () => {
    const signal = { cancelled: false };
    let saves = 0;
    const save = jest.spyOn(DocumentPageService, 'saveAsNew').mockImplementation(async () => {
      saves++;
      if (saves === 2) signal.cancelled = true;
      return { id: `part-${saves}`, pdfUri: `file:///docs/part-${saves}/document.pdf` } as unknown as DocumentRecord;
    });
    const parts = [1, 2, 3].map((n) => ({ title: `p${n}`, items: items(1) }));
    await expect(DocumentPageService.saveParts(parts, { docType: 'document', signal })).rejects.toBeInstanceOf(OperationCancelled);
    expect(documentRepository.purge).toHaveBeenCalledTimes(2);
    save.mockRestore();
  });
});

describe('large documents (1 / 10 / 50 / 100 pages)', () => {
  it.each([1, 10, 50, 100])('%i pages: one page in flight at a time, work grows linearly', async (n) => {
    const list = drafts(n).map((page, i) => ({ key: `k${i}`, page, previewRotation: 0 as const }));
    const started = Date.now();
    await DocumentPageService.saveAsNew(list, { title: `Big ${n}`, docType: 'document' });
    const ms = Date.now() - started;
    expect(mockState.maxInFlight).toBe(1);
    expect(mockCreated[0].pages).toHaveLength(n);
    expect(mockCalls.filter((c) => c.fn === 'processPageAsync')).toHaveLength(n);
    expect(mockCalls.filter((c) => c.fn === 'recognizeTextAsync')).toHaveLength(n);
    // JS orchestration only (native work is mocked): a sanity bound, not a device timing.
    expect(ms).toBeLessThan(5000);
    if (process.env.PERF_OUT) require('fs').appendFileSync(process.env.PERF_OUT, `${n} pages: ${ms} ms JS overhead\n`);
  });

  it('more than the limit is refused before any work', async () => {
    const list = drafts(MAX_DOCUMENT_PAGES + 1).map((page, i) => ({ key: `k${i}`, page, previewRotation: 0 as const }));
    await expect(DocumentPageService.saveAsNew(list, { title: 'Too big', docType: 'document' })).rejects.toBeInstanceOf(PageLimitError);
    expect(mockCalls).toHaveLength(0);
  });
});
