/** Document Tools Phase A UI: document menu, favourites/tag filters, Search filters, print. */
import React, { useEffect } from 'react';
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import type { DocumentRecord } from '@/core/document-engine/model';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { SearchScreen } from '@/features/search/SearchScreen';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
const mockStore = {
  documents: [] as DocumentRecord[],
  folders: [] as { id: string; name: string; systemKey: null; createdAt: number; itemCount: number }[],
  tags: [{ id: 'tax', name: 'ภาษี', count: 1 }],
  tagMap: {} as Record<string, string[]>,
  loaded: true,
  refresh: jest.fn(async () => undefined),
};
jest.mock('@/features/documents/documentsStore', () => {
  const state = () => ({ ...mockStore, recent: mockStore.documents });
  const useDocuments = (sel?: (s: ReturnType<typeof state>) => unknown) => (sel ? sel(state()) : state());
  useDocuments.getState = state;
  return { useDocuments };
});
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null, useReadableUri: () => null, clearReadableUris: () => undefined }));
const mockSearch = jest.fn(async () => [] as DocumentRecord[]);
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: { move: jest.fn(), rename: jest.fn(), search: (...a: unknown[]) => mockSearch(...(a as [])), ocrText: async () => '' },
  folderRepository: { create: jest.fn() },
}));
jest.mock('@/core/database/repositories/tagRepository', () => ({ tagRepository: {} }));
const mockEngine = { print: jest.fn(async () => undefined), share: jest.fn(), duplicate: jest.fn(), moveToTrash: jest.fn(), deletePermanently: jest.fn() };
jest.mock('@/core/document-engine/DocumentEngine', () => ({
  DocumentEngine: {
    print: (...a: unknown[]) => mockEngine.print(...(a as [])),
    share: (...a: unknown[]) => mockEngine.share(...(a as [])),
    export: { isShareAvailable: async () => true },
    duplicate: jest.fn(),
    moveToTrash: jest.fn(),
    deletePermanently: jest.fn(),
    capture: { hasNativeVision: () => true },
  },
}));
const mockSetFavorite = jest.fn(async () => undefined);
jest.mock('@/core/document-engine/services/DocumentMetadataService', () => ({
  DocumentMetadataService: { setFavorite: (...a: unknown[]) => mockSetFavorite(...(a as [])), info: jest.fn(async () => null) },
}));

beforeAll(() => initI18n('th'));
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  jest.clearAllMocks();
});

async function render(el: React.ReactElement) {
  await act(async () => void (await i18n.changeLanguage('th')));
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language="th">
          <TToastProvider>{el}</TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const doc = (id: string, o: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id, title: `Doc ${id}`, docType: 'document', folderId: null, pageCount: 1, sizeBytes: 1, pdfUri: 'file:///docs/x/doc.pdf', thumbnailUri: null,
  hasSensitive: false, isRedactedCopy: false, createdAt: 1, updatedAt: 1, openedAt: null, deletedAt: null, syncState: 'local_only', ...o,
});
const sheet = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => Array.isArray(n.props.items) && n.props.visible === true)[0];
const keys = (r: ReactTestRenderer) => (sheet(r).props.items as { key: string }[]).map((i) => i.key);

function Menu({ d, inViewer }: { d: DocumentRecord; inViewer?: boolean }) {
  const actions = useDocumentActions({ inViewer });
  // Open once on mount (`actions` is a new object each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => actions.open(d), []);
  return actions.element;
}

describe('document menu (⋯)', () => {
  it('order: open, rename, favourite, tags, move, share, print, duplicate, delete', async () => {
    const r = await render(<Menu d={doc('a')} />);
    expect(keys(r)).toEqual(['open', 'rename', 'favorite', 'tags', 'move', 'share', 'print', 'duplicate', 'delete']);
  });

  it('in the Viewer: Document info instead of Open; no Print without a PDF; no "coming soon"', async () => {
    const r = await render(<Menu d={doc('a', { pdfUri: null })} inViewer />);
    expect(keys(r)).toEqual(['info', 'rename', 'favorite', 'tags', 'move', 'share', 'duplicate', 'delete']);
  });

  it('favourite toggles through the metadata service; print uses the Android print framework', async () => {
    const r = await render(<Menu d={doc('a', { isFavorite: false })} />);
    await act(async () => sheet(r).props.onSelect('favorite'));
    expect(mockSetFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true);
    const r2 = await render(<Menu d={doc('b')} />);
    await act(async () => sheet(r2).props.onSelect('print'));
    expect(mockEngine.print).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('a favourite offers "remove from favourites"', async () => {
    const r = await render(<Menu d={doc('a', { isFavorite: true })} />);
    const fav = (sheet(r).props.items as { key: string; label: string }[]).find((i) => i.key === 'favorite')!;
    expect(fav.label).toBe(i18n.t('documents.unfavorite'));
  });
});

describe('Documents filters', () => {
  it('Favourites and tag chips show only matching documents', async () => {
    mockStore.documents = [doc('a', { isFavorite: true }), doc('b'), doc('c')];
    mockStore.tagMap = { c: ['tax'] };
    const r = await render(<DocumentsScreen />);
    const shown = () => r.root.findAll((n) => typeof n.props.testID === 'string' && /^doc-/.test(n.props.testID) && typeof n.type === 'string').map((n) => n.props.testID);
    expect(shown()).toEqual(['doc-a', 'doc-b', 'doc-c']);
    await act(async () => r.root.find((n) => n.props.testID === 'chip-favorites' && n.props.onPress).props.onPress());
    expect(shown()).toEqual(['doc-a']);
    await act(async () => r.root.find((n) => n.props.testID === 'chip-tag-ภาษี' && n.props.onPress).props.onPress());
    expect(shown()).toEqual(['doc-c']);
  });
});

describe('Search filters', () => {
  it('a filter alone runs a local search with that filter', async () => {
    jest.useFakeTimers();
    const r = await render(<SearchScreen />);
    await act(async () => r.root.find((n) => n.props.testID === 'filter-favorite' && n.props.onPress).props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockSearch).toHaveBeenCalledWith('', 100, expect.objectContaining({ favorite: true }));
    await act(async () => r.root.find((n) => n.props.testID === 'filter-type' && n.props.onPress).props.onPress());
    await act(async () => sheet(r).props.onSelect('receipt'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockSearch).toHaveBeenLastCalledWith('', 100, expect.objectContaining({ favorite: true, docType: 'receipt' }));
    jest.useRealTimers();
  });
});
