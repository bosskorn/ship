/** Renders the in-app Privacy Policy / Terms pages to HTML for src/__screens__/shoot.js. */
/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
// @ts-expect-error react-dom ships no types here; only createRoot is used.
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { TagsScreen } from '@/features/documents/TagsScreen';
import { SearchScreen } from '@/features/search/SearchScreen';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { DocumentInfoDialog, TagPickerDialog } from '@/features/documents/DocumentSheets';
import type { DocumentRecord } from '@/core/document-engine/model';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@/features/home/HomeScreen', () => ({ openScanner: jest.fn() }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null, useReadableUri: () => null, clearReadableUris: () => undefined }));
const mockNow = Date.UTC(2026, 9, 15, 3);
const mk = (id: string, title: string, type: DocumentRecord['docType'], pages: number, kb: number, days: number, fav = false): DocumentRecord => ({
  id, title, docType: type, folderId: id === 'a' ? 'f1' : null, pageCount: pages, sizeBytes: kb * 1024, pdfUri: 'p', thumbnailUri: null, hasSensitive: false,
  isRedactedCopy: false, createdAt: mockNow - days * 864e5, updatedAt: mockNow - days * 864e5, openedAt: null, deletedAt: null, syncState: 'local_only', isFavorite: fav,
});
const mockDocs = [
  mk('a', 'ใบเสร็จร้านกาแฟ', 'receipt', 1, 412, 0, true),
  mk('b', 'สัญญาเช่าคอนโด', 'document', 6, 3870, 2),
  mk('c', 'OneScan_2026-10-15_10-30', 'document', 2, 958, 0),
  mk('d', 'OneScan_2026-10-15_10-30_2', 'document', 1, 512, 0, true),
  mk('e', 'บัตรประชาชน', 'id_card', 1, 300, 5),
];
jest.mock('@/features/documents/documentsStore', () => {
  const state = () => ({
    documents: mockDocs, recent: mockDocs, folders: [{ id: 'f1', name: 'งาน', systemKey: null, createdAt: 1, itemCount: 1 }],
    tags: [{ id: 't1', name: 'ภาษี', count: 2 }, { id: 't2', name: 'งาน', count: 1 }, { id: 't3', name: 'ส่วนตัว', count: 0 }],
    tagMap: { a: ['t1', 't2'], b: ['t1'] }, loaded: true, refresh: async () => undefined,
  });
  const useDocuments = (sel?: (s: ReturnType<typeof state>) => unknown) => (sel ? sel(state()) : state());
  useDocuments.getState = state;
  return { useDocuments };
});
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: { search: async () => mockDocs.filter((d) => d.isFavorite), ocrText: async () => '' },
  folderRepository: {},
}));
jest.mock('@/core/database/repositories/tagRepository', () => ({ tagRepository: {} }));
jest.mock('@/core/document-engine/DocumentEngine', () => ({ DocumentEngine: { capture: { hasNativeVision: () => true }, export: { isShareAvailable: async () => true } } }));
jest.mock('@/core/document-engine/services/DocumentMetadataService', () => ({
  DocumentMetadataService: {
    setFavorite: jest.fn(),
    info: async () => ({ title: 'ใบเสร็จร้านกาแฟ', docType: 'receipt', pageCount: 1, createdAt: mockNow, updatedAt: mockNow, sizeBytes: 412 * 1024, folder: { name: 'งาน', systemKey: null }, tags: ['ภาษี', 'งาน'] }),
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Menu() {
  const a = useDocumentActions();
  React.useEffect(() => a.open(mockDocs[0]), []); // eslint-disable-line react-hooks/exhaustive-deps
  return a.element;
}
const Picker = () => <TagPickerDialog doc={mockDocs[0]} onClose={() => undefined} />;
const Info = () => <DocumentInfoDialog doc={mockDocs[0]} onClose={() => undefined} />;
function DocsWithFavorites() {
  return <DocumentsScreen />;
}

async function page(Content: React.ComponentType, lang: string, scheme: 'light' | 'dark', press: string[] = []) {
  const width = 412;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () =>
    root.render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme={scheme} language={lang}>
          <TToastProvider>
            <Content />
          </TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    ),
  );
  await act(async () => new Promise((r) => setTimeout(r, 50)));
  for (const id of press) {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`no ${id}`);
    await act(async () => el.click());
  }
  await act(async () => new Promise((r) => setTimeout(r, 400)));
  // Modals render in a portal next to #root: keep the whole body.
  const html = document.body.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  act(() => root.unmount());
  const bg = scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
<style id="${sheet.id}">${sheet.textContent}</style><style>html,body{margin:0;background:${bg}} #root{display:flex;min-height:100vh}
*{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body>${html}</body></html>`;
}

beforeAll(() => {
  initI18n('th');
  fs.mkdirSync(OUT, { recursive: true });
});

const shots: [string, React.ComponentType, string, 'light' | 'dark', string[]][] = [
  ['app-a1-documents-th', DocsWithFavorites, 'th', 'light', []],
  ['app-a2-documents-favorites-th', DocsWithFavorites, 'th', 'light', ['chip-favorites']],
  ['app-a3-menu-th', Menu, 'th', 'light', []],
  ['app-a4-tagpicker-th', Picker, 'th', 'light', []],
  ['app-a5-info-th', Info, 'th', 'light', []],
  ['app-a6-tags-th', TagsScreen, 'th', 'light', []],
  ['app-a7-search-filters-th', SearchScreen, 'th', 'light', ['filter-favorite']],
  ['app-a8-documents-en-dark', DocsWithFavorites, 'en', 'dark', []],
];

it.each(shots)('%s', async (name, Content, lang, scheme, press) => {
  await i18n.changeLanguage(lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), await page(Content, lang, scheme, press));
});
