/**
 * DocumentEngine flows with the native module, DB and file system mocked:
 * verifies on-device redaction never touches the original and that the
 * scan pipeline wires detection → processing → PDF → OCR → index.
 */
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { PDFEngine } from '@/core/document-engine/pdf/PDFEngine';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useScanDiagnostics } from '@/core/document-engine/image/diagnostics';

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
      case 'processPageAsync': {
        const o = args[4] as { maxEdge: number } | undefined;
        const big = !o || o.maxEdge === 0 || o.maxEdge >= 4000;
        return Promise.resolve({ uri: `file:///cache/processed-${nativeCalls.length}.jpg`, width: big ? 3024 : 1200, height: big ? 4032 : 1600, quality: 95 });
      }
      case 'imageInfoAsync':
        return Promise.resolve({ width: 3024, height: 4032, bytes: 3_800_000, mimeType: 'image/jpeg', orientation: 0 });
      case 'resizeAsync':
        return Promise.resolve({ uri: `file:///cache/resized-${nativeCalls.length}.jpg`, width: 1200, height: 1600, bytes: 200_000 });
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
      imageInfoAsync: record('imageInfoAsync'),
      resizeAsync: record('resizeAsync'),
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

describe('v1.0.5 image tiers', () => {
  const draftPage = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'd1',
    sourceUri: 'file:///cache/mlkit-scan.jpg',
    processedUri: 'file:///cache/preview.jpg',
    width: 1200,
    height: 1600,
    filter: 'auto' as const,
    rotation: 0 as const,
    ...over,
  });

  test('capture renders only a fast preview; the master waits for save', async () => {
    await DocumentEngine.processScanned('file:///cache/mlkit-scan.jpg');
    const calls = nativeCalls.filter((c) => c.fn === 'processPageAsync');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[4]).toEqual({ maxEdge: 1600, quality: 85 });
  });

  test('save renders the master once from the original at High quality and files every tier', async () => {
    await DocumentEngine.save([draftPage()], { title: 'Doc', docType: 'document' });
    const renders = nativeCalls.filter((c) => c.fn === 'processPageAsync');
    expect(renders).toHaveLength(1);
    expect(renders[0].args[0]).toBe('file:///cache/mlkit-scan.jpg'); // from the original, not the preview
    expect(renders[0].args[4]).toEqual({ maxEdge: 4000, quality: 95 });
    const page = created[0].pages[0];
    expect(page).toMatchObject({ width: 3024, height: 4032 });
    expect(page.imageUri).toMatch(/^file:\/\/\/docs\/[^/]+\/processed\/page-1\.jpg$/);
    expect(page.sourceUri).toMatch(/\/original\/page-1\.jpg$/);
    expect(page.previewUri).toMatch(/\/preview\/page-1\.jpg$/);
    // PDF from masters, never previews or thumbnails.
    const pdfPages = (PDFEngine.create as jest.Mock).mock.calls.at(-1)[0];
    expect(pdfPages.map((p: { uri: string }) => p.uri)).toEqual([page.imageUri]);
    // OCR reads the master (it decodes its own working copy natively).
    expect(nativeCalls.find((c) => c.fn === 'recognizeTextAsync')!.args[0]).toBe(page.imageUri);
    // Diagnostics: master keeps all of the source's pixels.
    const d = useScanDiagnostics.getState().pages[0];
    expect(d.stages.master).toMatchObject({ width: 3024, height: 4032, quality: 95 });
    expect(d.stages.source).toMatchObject({ width: 3024, height: 4032 });
  });

  test('Standard quality asks for a smaller master', async () => {
    await DocumentEngine.save([draftPage()], { title: 'Doc', docType: 'document', quality: 'standard' });
    expect(nativeCalls.find((c) => c.fn === 'processPageAsync')!.args[4]).toEqual({ maxEdge: 2200, quality: 88 });
  });

  test('Original filter without edits keeps the scanner JPEG as the master (no re-encode)', async () => {
    await DocumentEngine.save([draftPage({ filter: 'original' })], { title: 'Doc', docType: 'document' });
    expect(nativeCalls.filter((c) => c.fn === 'processPageAsync')).toHaveLength(0);
    expect(created[0].pages[0]).toMatchObject({ width: 3024, height: 4032 });
    expect(created[0].pages[0].imageUri).toMatch(/\/processed\/page-1\.jpg$/);
  });

  test('editing a saved page starts again from its original and edit parameters', async () => {
    const quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    (documentRepository.pages as jest.Mock).mockResolvedValueOnce([
      {
        id: 'p1', documentId: 'doc', pageIndex: 0, imageUri: 'file:///docs/doc/processed/page-1.jpg', width: 3024, height: 4032,
        filter: 'gray', rotation: 90, sourceUri: 'file:///docs/doc/original/page-1.jpg', previewUri: 'file:///docs/doc/preview/page-1.jpg', quad,
      },
    ]);
    const [d] = await DocumentEngine.draftsFor('doc');
    expect(d).toMatchObject({ sourceUri: 'file:///docs/doc/original/page-1.jpg', processedUri: 'file:///docs/doc/preview/page-1.jpg', filter: 'gray', rotation: 90, quad });
  });

  test('pages saved before 1.0.5 (no original) stay editable', async () => {
    const [d] = await DocumentEngine.draftsFor('orig');
    expect(d).toMatchObject({ sourceUri: 'file:///docs/orig/page-1.jpg', filter: 'original', rotation: 0 });
  });

  test('a redacted copy keeps no unredacted original', async () => {
    await DocumentEngine.createRedactedCopy({ id: 'orig', title: 'Bill', docType: 'invoice', folderId: null } as any, 'Bill (redacted)');
    const page = created[0].pages[0];
    expect(page.sourceUri).toBe(page.imageUri);
    expect(page.sourceUri).not.toContain('/orig/');
  });
});
