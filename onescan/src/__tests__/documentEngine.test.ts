/**
 * DocumentEngine flows with the native module, DB and file system mocked:
 * verifies on-device redaction never touches the original and that the
 * scan pipeline wires detection → processing → PDF → OCR → index.
 */
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';

const created: any[] = [];
const nativeCalls: { fn: string; args: unknown[] }[] = [];

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

jest.mock('@/native/OneScanVision', () => {
  const gray = (() => {
    // 64×80 dark frame with a bright page in the middle.
    const w = 64;
    const h = 80;
    const d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = x > 10 && x < 54 && y > 12 && y < 68 ? 220 : 40;
    const { bytesToBase64 } = jest.requireActual('@/core/document-engine/security/SecurityEngine');
    return { width: w, height: h, data: bytesToBase64(d) };
  })();
  const record = (fn: string) => (...args: unknown[]) => {
    nativeCalls.push({ fn, args });
    switch (fn) {
      case 'grayscaleAsync':
        return Promise.resolve(gray);
      case 'processPageAsync':
        return Promise.resolve({ uri: `file:///cache/processed-${nativeCalls.length}.jpg`, width: 1240, height: 1754 });
      case 'recognizeTextAsync':
        return Promise.resolve([
          { text: 'Invoice 42', box: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 }, confidence: 0.9 },
          { text: 'Tel 081-234-5678', box: { x: 0.1, y: 0.2, width: 0.5, height: 0.05 }, confidence: 0.9 },
        ]);
      case 'redactRegionsAsync':
        return Promise.resolve({ uri: 'file:///cache/redacted.jpg' });
      default:
        return Promise.reject(new Error(fn));
    }
  };
  return {
    OneScanVision: {
      grayscaleAsync: record('grayscaleAsync'),
      processPageAsync: record('processPageAsync'),
      recognizeTextAsync: record('recognizeTextAsync'),
      redactRegionsAsync: record('redactRegionsAsync'),
      renderPdfAsync: record('renderPdfAsync'),
    },
  };
});

jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: {
    create: jest.fn(async (input: any) => {
      created.push(input);
      return { id: `doc-${created.length}`, ...input };
    }),
    pages: jest.fn(async () => [
      { id: 'p1', documentId: 'orig', pageIndex: 0, imageUri: 'file:///docs/orig/page-1.jpg', width: 1240, height: 1754, filter: 'auto', rotation: 0 },
    ]),
    ocrText: jest.fn(async () => ''),
  },
  folderRepository: { bySystemKey: jest.fn(async () => 'folder-receipts') },
}));

jest.mock('@/core/document-engine/storage/DocumentFileStore', () => ({
  DocumentFileStore: {
    adopt: (uri: string, docId: string, name: string) => ({ uri: `file:///docs/${docId}/${name}`, source: uri }),
    size: () => 1234,
    readBase64: async () => 'AAAA',
    deleteDocument: jest.fn(),
  },
}));

jest.mock('@/core/document-engine/pdf/PDFEngine', () => ({
  PDFEngine: { create: jest.fn(async () => ({ uri: 'file:///cache/out.pdf', pageCount: 1 })) },
}));

jest.mock('@/core/document-engine/image/ImageEngine', () => {
  const { OneScanVision } = jest.requireMock('@/native/OneScanVision');
  return {
    ImageEngine: {
      process: async (uri: string, o: any) => ({ ...(await OneScanVision.processPageAsync(uri, o.quad, o.filter, o.rotation)), filterApplied: true }),
      thumbnail: async () => 'file:///cache/thumb.jpg',
    },
  };
});

jest.mock('expo-sharing', () => ({}));
jest.mock('expo-print', () => ({}));


beforeEach(() => {
  created.length = 0;
  nativeCalls.length = 0;
});

test('capture detects the page and perspective-corrects it on device', async () => {
  const page = await DocumentEngine.processCapture('file:///cache/capture.jpg');
  const call = nativeCalls.find((c) => c.fn === 'processPageAsync')!;
  const quad = call.args[1] as { x: number; y: number }[];
  expect(quad).toHaveLength(4);
  expect(quad[0].x).toBeGreaterThan(0.1);
  expect(quad[2].x).toBeLessThan(0.9);
  expect(page.quad).toEqual(quad);
  expect(page.filter).toBe('auto');
});

test('save builds PDF, OCR index and flags sensitive content', async () => {
  const draft = [{ id: 'd1', sourceUri: 's', processedUri: 'file:///cache/p.jpg', width: 10, height: 10, filter: 'auto' as const, rotation: 0 as const }];
  await DocumentEngine.save(draft, { title: 'Receipt', docType: 'receipt' });
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ title: 'Receipt', folderId: 'folder-receipts', hasSensitive: true });
  expect(created[0].ocrText).toContain('081-234-5678');
  expect(nativeCalls.find((c) => c.fn === 'recognizeTextAsync')!.args[1]).toEqual(['th', 'en']);
});

test('redacted copy blacks out PII lines and keeps the original intact', async () => {
  const original = { id: 'orig', title: 'Bill', docType: 'invoice', folderId: null } as any;
  await DocumentEngine.createRedactedCopy(original, 'Bill (redacted)');
  const redact = nativeCalls.find((c) => c.fn === 'redactRegionsAsync')!;
  expect(redact.args[0]).toBe('file:///docs/orig/page-1.jpg');
  expect(redact.args[1]).toEqual([{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }]); // only the phone line
  const copy = created[0];
  expect(copy).toMatchObject({ isRedactedCopy: true, sourceDocumentId: 'orig', hasSensitive: false });
  expect(copy.ocrText).toContain('08X-XXX-XXXX');
  expect(copy.ocrText).not.toContain('234-5678');
  expect(copy.pages[0].imageUri).not.toContain('/orig/');
});
