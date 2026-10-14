/** Document Tools Phase B: Page Manager, Merge, Split and PDF → images screens (services mocked). */
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import type { DocumentRecord, DraftPage } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
const mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null }));
jest.mock('@/features/editor/CropEditor', () => ({ CropEditor: () => null }));
jest.mock('@/core/document-engine/storage/diskSpace', () => ({ isDiskFull: () => false }));
jest.mock('@/features/documents/DocumentListItem', () => ({ DocumentTypeBadge: () => null, useDocumentMeta: () => '' }));
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: {
    get: jest.fn(async (id: string) => mockDocs.find((d) => d.id === id) ?? null),
    pages: jest.fn(async (id: string) => Array.from({ length: mockDocs.find((d) => d.id === id)?.pageCount ?? 0 }, (_, i) => ({ imageUri: `file:///m/${id}-${i + 1}.jpg` }))),
    titlesLike: jest.fn(async () => []),
  },
}));
jest.mock('@/features/documents/documentsStore', () => {
  const { create } = jest.requireActual('zustand');
  return { useDocuments: create(() => ({ documents: mockDocs, refresh: jest.fn(async () => undefined) })) };
});
jest.mock('@/core/document-engine/services/ImageExportService', () => ({
  ImageExportService: {
    exportPages: jest.fn(async (pages: unknown[]) => pages.map((_, i) => ({ uri: `file:///x/${i}.jpg`, name: `${i}.jpg`, mimeType: 'image/jpeg' }))),
    saveToDevice: jest.fn(async (files: unknown[]) => files.length),
    shareOne: jest.fn(async () => undefined),
  },
}));
jest.mock('@/core/document-engine/services/DocumentPageService', () => {
  class PageLimitError extends Error {
    limit = 50;
  }
  let n = 0;
  const item = (docId: string | undefined, i: number) => ({
    key: `k${++n}`,
    page: { id: `p${n}`, sourceUri: `file:///s/${docId}-${i}.jpg`, processedUri: `file:///v/${docId}-${i}.jpg`, filter: 'original', rotation: 0 },
    previewRotation: 0,
    sourceDocumentId: docId,
  });
  return {
    PageLimitError,
    DocumentPageService: {
      fromDocument: jest.fn(async (doc: { id: string; pageCount: number }) => Array.from({ length: doc.pageCount }, (_, i) => item(doc.id, i + 1))),
      copy: jest.fn((it: { page: object }) => ({ ...it, key: `c${++n}`, page: { ...it.page, id: `cp${n}` } })),
      rotate: jest.fn((it: { page: { rotation: number } }, d: number) => ({ ...it, page: { ...it.page, rotation: (it.page.rotation + d + 360) % 360 } })),
      saveAsNew: jest.fn(async () => ({ id: 'new-doc' })),
      saveInto: jest.fn(async () => undefined),
    },
  };
});

const doc = (id: string, pageCount: number): DocumentRecord =>
  ({ id, title: `Doc ${id}`, pageCount, docType: 'document', createdAt: 1, updatedAt: 1 }) as unknown as DocumentRecord;
const mockDocs: DocumentRecord[] = [doc('a', 2), doc('b', 3), doc('c', 1)];

const { PageManagerScreen } = require('@/features/pages/PageManagerScreen') as typeof import('@/features/pages/PageManagerScreen');
const { MergeScreen } = require('@/features/pages/MergeScreen') as typeof import('@/features/pages/MergeScreen');
const { SplitScreen } = require('@/features/pages/SplitScreen') as typeof import('@/features/pages/SplitScreen');
const { ToImagesScreen } = require('@/features/pages/ToImagesScreen') as typeof import('@/features/pages/ToImagesScreen');
const { usePageWorkspace } = require('@/features/pages/pageWorkspace') as typeof import('@/features/pages/pageWorkspace');
const { DocumentPageService } = jest.requireMock('@/core/document-engine/services/DocumentPageService') as { DocumentPageService: Record<string, jest.Mock> };
const { ImageExportService } = jest.requireMock('@/core/document-engine/services/ImageExportService') as { ImageExportService: Record<string, jest.Mock> };
const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router;

beforeAll(() => initI18n('th'));
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  usePageWorkspace.getState().clear();
  delete mockParams.id;
  jest.clearAllMocks();
});

async function render(el: React.ReactElement) {
  await act(async () => void (await i18n.changeLanguage('th')));
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language="th">
          <TToastProvider>{el}</TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const pressable = (r: ReactTestRenderer, id: string) => {
  const found = r.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function');
  if (!found.length) throw new Error(`no pressable ${id}`);
  return found[found.length - 1];
};
const press = async (r: ReactTestRenderer, id: string) => act(async () => pressable(r, id).props.onPress());
const disabled = (r: ReactTestRenderer, id: string) => !!pressable(r, id).props.disabled;
const text = (r: ReactTestRenderer, id: string) => {
  const n = r.root.find((x) => x.props.testID === id && typeof x.type === 'string');
  const flat = (c: unknown): string => (Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '');
  return flat(n.props.children);
};

async function openWorkspace(purpose: 'document' | 'images' | 'merge', ids: string[]) {
  const items: PageItem[] = [];
  for (const id of ids) items.push(...(await DocumentPageService.fromDocument(mockDocs.find((d) => d.id === id))));
  usePageWorkspace.getState().open({ purpose, items, documentId: purpose === 'document' ? ids[0] : null });
  return items;
}
const keys = () => usePageWorkspace.getState().items.map((i) => i.key);
const ids = () => usePageWorkspace.getState().items.map((i) => (i.page as DraftPage).id);

describe('Page Manager', () => {
  it('Manage pages saves into the same document only after a change', async () => {
    const before = await openWorkspace('document', ['b']);
    const r = await render(<PageManagerScreen />);
    expect(disabled(r, 'pm-save')).toBe(true);
    await press(r, 'pm-select');
    await press(r, 'page-1');
    await press(r, 'pm-later');
    expect(keys()).toEqual([before[1].key, before[0].key, before[2].key]);
    await press(r, 'pm-select');
    expect(disabled(r, 'pm-save')).toBe(false);
    await press(r, 'pm-save');
    expect(DocumentPageService.saveInto).toHaveBeenCalledTimes(1);
    expect(DocumentPageService.saveInto.mock.calls[0][0].id).toBe('b');
    expect(DocumentPageService.saveAsNew).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('rotate, duplicate and delete act on the selection; the last page cannot be deleted', async () => {
    await openWorkspace('document', ['a']);
    const r = await render(<PageManagerScreen />);
    await press(r, 'pm-select');
    await press(r, 'page-2');
    await press(r, 'pm-rotate-right');
    expect(usePageWorkspace.getState().items.map((i) => i.page.rotation)).toEqual([0, 90]);
    await press(r, 'pm-duplicate');
    expect(usePageWorkspace.getState().items).toHaveLength(3);
    expect(new Set(ids()).size).toBe(3);
    // Select everything and try to delete it: refused.
    await press(r, 'page-1');
    await press(r, 'page-3');
    await press(r, 'pm-delete');
    expect(usePageWorkspace.getState().items).toHaveLength(3);
    // Delete one.
    await press(r, 'page-1');
    await press(r, 'page-3');
    await press(r, 'pm-delete');
    expect(usePageWorkspace.getState().items).toHaveLength(2);
  });

  it('Merge and Images → PDF create a new document and never write into a source', async () => {
    for (const purpose of ['merge', 'images'] as const) {
      await openWorkspace(purpose, ['a', 'b']);
      const r = await render(<PageManagerScreen />);
      await press(r, 'pm-save');
      expect(DocumentPageService.saveInto).not.toHaveBeenCalled();
      expect(DocumentPageService.saveAsNew).toHaveBeenCalledTimes(1);
      expect(DocumentPageService.saveAsNew.mock.calls[0][0]).toHaveLength(5);
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/document/[id]', params: { id: 'new-doc' } });
      act(() => r.unmount());
      mounted.splice(0);
      jest.clearAllMocks();
    }
  });
});

describe('Merge', () => {
  it('needs two documents and keeps the chosen order', async () => {
    const r = await render(<MergeScreen />);
    expect(disabled(r, 'merge-next')).toBe(true);
    await press(r, 'merge-b');
    expect(disabled(r, 'merge-next')).toBe(true);
    await press(r, 'merge-a');
    expect(text(r, 'merge-summary')).toContain('5');
    await press(r, 'merge-next');
    const ws = usePageWorkspace.getState();
    expect(ws.purpose).toBe('merge');
    expect(ws.items.map((i) => i.sourceDocumentId)).toEqual(['b', 'b', 'b', 'a', 'a']);
    expect(mockRouter.replace).toHaveBeenCalledWith('/pages');
  });
});

describe('Split', () => {
  it('ranges make one new document per range, named after the pages, source untouched', async () => {
    mockParams.id = 'b';
    const r = await render(<SplitScreen />);
    await act(async () => r.root.find((n) => n.props.testID === 'split-input' && typeof n.props.onChangeText === 'function').props.onChangeText('1-2, 3'));
    await press(r, 'split-run');
    expect(DocumentPageService.saveAsNew).toHaveBeenCalledTimes(2);
    const titles = DocumentPageService.saveAsNew.mock.calls.map((c) => c[1].title);
    expect(titles).toEqual(['Doc b_p1-2', 'Doc b_p3']);
    expect(DocumentPageService.saveAsNew.mock.calls.map((c) => c[0].length)).toEqual([2, 1]);
    expect(DocumentPageService.saveInto).not.toHaveBeenCalled();
  });

  it('bad ranges block the run', async () => {
    mockParams.id = 'b';
    const r = await render(<SplitScreen />);
    await act(async () => r.root.find((n) => n.props.testID === 'split-input' && typeof n.props.onChangeText === 'function').props.onChangeText('2-9'));
    expect(disabled(r, 'split-run')).toBe(true);
  });

  it('every page mode splits into single pages', async () => {
    mockParams.id = 'b';
    const r = await render(<SplitScreen />);
    await press(r, 'split-all');
    await press(r, 'split-run');
    expect(DocumentPageService.saveAsNew).toHaveBeenCalledTimes(3);
  });
});

describe('PDF → images', () => {
  it('share is only for one page; save exports the chosen pages in the chosen format', async () => {
    mockParams.id = 'b';
    const r = await render(<ToImagesScreen />);
    expect(disabled(r, 'img-share')).toBe(true);
    await press(r, 'fmt-png');
    await press(r, 'img-save');
    expect(ImageExportService.exportPages).toHaveBeenCalledTimes(1);
    const [pages, opts] = ImageExportService.exportPages.mock.calls[0];
    expect(pages.map((p: { pageNumber: number }) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(opts.format).toBe('png');
    expect(ImageExportService.saveToDevice).toHaveBeenCalled();

    // Pick only page 2: share becomes available and exports just that page.
    await press(r, 'pick-all');
    await press(r, 'page-2');
    expect(disabled(r, 'img-share')).toBe(false);
    await press(r, 'img-share');
    expect(ImageExportService.exportPages.mock.calls[1][0]).toEqual([{ uri: 'file:///m/b-2.jpg', pageNumber: 2 }]);
    expect(ImageExportService.shareOne).toHaveBeenCalled();
  });

  it('import back creates a new document from copies', async () => {
    mockParams.id = 'a';
    const r = await render(<ToImagesScreen />);
    await press(r, 'img-import');
    expect(DocumentPageService.saveAsNew).toHaveBeenCalledTimes(1);
    expect(DocumentPageService.copy).toHaveBeenCalledTimes(2);
    expect(DocumentPageService.saveInto).not.toHaveBeenCalled();
  });
});
