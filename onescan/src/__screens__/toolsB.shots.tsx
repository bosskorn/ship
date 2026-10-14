/** Document Tools Phase B screens (Page Manager, Merge, Split, PDF → images) for src/__screens__/shoot.js. */
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
import type { DocumentRecord } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
const mockParams: { id?: string } = {};
jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => mockParams }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/features/home/HomeScreen', () => ({ openScanner: jest.fn() }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
jest.mock('@/core/document-engine/storage/diskSpace', () => ({ isDiskFull: () => false }));
jest.mock('@/core/database/repositories/tagRepository', () => ({ tagRepository: {} }));
jest.mock('@/features/editor/CropEditor', () => ({ CropEditor: () => null }));
// Thumbnails: a plain "paper" page with a few text lines (real images need the native decryptor).
jest.mock('@/features/shared/SecureImage', () => {
  const R = require('react');
  const { View } = require('react-native');
  const line = (w: string, k: number) => R.createElement(View, { key: k, style: { height: 4, width: w, backgroundColor: '#C9CFD8', borderRadius: 2, marginTop: 6 } });
  return {
    SecureImage: ({ style }: { style?: object }) =>
      R.createElement(View, { style: [style, { backgroundColor: '#FFFFFF', padding: 10 }] }, R.createElement(View, { style: { height: 6, width: '55%', backgroundColor: '#8A93A3', borderRadius: 2 } }), ['90%', '80%', '86%', '60%', '84%', '72%'].map(line)),
    useReadableUri: () => null,
    clearReadableUris: () => undefined,
  };
});
const mockNow = Date.UTC(2026, 9, 15, 3);
const mk = (id: string, title: string, pages: number, kb: number, days: number): DocumentRecord => ({
  id, title, docType: 'document', folderId: null, pageCount: pages, sizeBytes: kb * 1024, pdfUri: 'p', thumbnailUri: null, hasSensitive: false,
  isRedactedCopy: false, createdAt: mockNow - days * 864e5, updatedAt: mockNow - days * 864e5, openedAt: null, deletedAt: null, syncState: 'local_only', isFavorite: false,
});
const mockDocs = [
  mk('a', 'สัญญาเช่าคอนโด', 12, 6200, 2),
  mk('b', 'ใบแจ้งหนี้ ต.ค.', 3, 1400, 0),
  mk('c', 'OneScan_2026-10-15_10-30', 2, 958, 0),
  mk('d', 'หนังสือรับรองเงินเดือน', 1, 512, 5),
];
jest.mock('@/features/documents/documentsStore', () => {
  const state = () => ({ documents: mockDocs, recent: mockDocs, folders: [], tags: [], tagMap: {}, loaded: true, refresh: async () => undefined });
  const useDocuments = (sel?: (s: ReturnType<typeof state>) => unknown) => (sel ? sel(state()) : state());
  useDocuments.getState = state;
  return { useDocuments };
});
jest.mock('@/features/documents/DocumentListItem', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    DocumentTypeBadge: ({ size }: { size: number }) => R.createElement(View, { style: { width: size, height: size, borderRadius: 10, backgroundColor: '#E8EEFC' } }),
    useDocumentMeta: (d: { pageCount: number }) => `${d.pageCount} หน้า · 15 ต.ค. 2569`,
  };
});
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: {
    get: async (id: string) => mockDocs.find((d) => d.id === id) ?? null,
    pages: async (id: string) => Array.from({ length: mockDocs.find((d) => d.id === id)?.pageCount ?? 0 }, (_, i) => ({ imageUri: `m${i}` })),
    titlesLike: async () => [],
  },
  folderRepository: {},
}));
jest.mock('@/core/document-engine/services/DocumentPageService', () => {
  let n = 0;
  return {
    PageLimitError: class extends Error {},
    DocumentPageService: {
      discard: () => undefined,
      fromDocument: async (doc: { id: string; pageCount: number }) =>
        Array.from({ length: doc.pageCount }, () => ({ key: `k${++n}`, page: { id: `p${n}`, sourceUri: 's', processedUri: 'v', filter: 'original', rotation: 0 }, previewRotation: 0, sourceDocumentId: doc.id })),
    },
  };
});
jest.mock('@/core/document-engine/services/ImageExportService', () => ({ ImageExportService: {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: give react-native-web's Dimensions a phone window before screens load.
for (const [k, v] of [['clientWidth', 412], ['clientHeight', 915]] as const) Object.defineProperty(document.documentElement, k, { configurable: true, value: v });
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 915 });

const { ToolsScreen } = require('@/features/tools/ToolsScreen') as typeof import('@/features/tools/ToolsScreen');
const { PageManagerScreen } = require('@/features/pages/PageManagerScreen') as typeof import('@/features/pages/PageManagerScreen');
const { MergeScreen } = require('@/features/pages/MergeScreen') as typeof import('@/features/pages/MergeScreen');
const { SplitScreen } = require('@/features/pages/SplitScreen') as typeof import('@/features/pages/SplitScreen');
const { ToImagesScreen } = require('@/features/pages/ToImagesScreen') as typeof import('@/features/pages/ToImagesScreen');
const { usePageWorkspace } = require('@/features/pages/pageWorkspace') as typeof import('@/features/pages/pageWorkspace');
const { DocumentPageService } = require('@/core/document-engine/services/DocumentPageService') as { DocumentPageService: { fromDocument: (d: DocumentRecord) => Promise<PageItem[]> } };

type Step = string | { type: string; into: string };
interface Shot {
  name: string;
  Content: React.ComponentType;
  lang: string;
  scheme: 'light' | 'dark';
  steps?: Step[];
  docId?: string;
  workspace?: { purpose: 'document' | 'images' | 'merge'; docs: string[] };
}

async function page({ Content, lang, scheme, steps = [], docId, workspace }: Shot) {
  const width = 412;
  if (docId) mockParams.id = docId;
  else delete mockParams.id;
  if (workspace) {
    const items: PageItem[] = [];
    for (const id of workspace.docs) items.push(...(await DocumentPageService.fromDocument(mockDocs.find((d) => d.id === id)!)));
    usePageWorkspace.getState().open({ purpose: workspace.purpose, items, documentId: workspace.purpose === 'document' ? workspace.docs[0] : null });
  }
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
  for (const step of steps) {
    const id = typeof step === 'string' ? step : step.into;
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`no ${id}`);
    if (typeof step === 'string') await act(async () => el.click());
    else {
      const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, step.type);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }
  await act(async () => new Promise((r) => setTimeout(r, 400)));
  const html = document.body.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  act(() => root.unmount());
  usePageWorkspace.getState().clear();
  const bg = scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
<style id="${sheet.id}">${sheet.textContent}</style><style>html,body{margin:0;background:${bg}} #root{display:flex;height:100vh;overflow:hidden}
*{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body>${html}</body></html>`;
}

beforeAll(() => {
  initI18n('th');
  fs.mkdirSync(OUT, { recursive: true });
});

const shots: Shot[] = [
  { name: 'app-b1-tools-th', Content: ToolsScreen, lang: 'th', scheme: 'light' },
  { name: 'app-b2-pages-document-th', Content: PageManagerScreen, lang: 'th', scheme: 'light', workspace: { purpose: 'document', docs: ['b'] } },
  { name: 'app-b3-pages-select-th', Content: PageManagerScreen, lang: 'th', scheme: 'light', workspace: { purpose: 'document', docs: ['a'] }, steps: ['pm-select', 'page-2', 'page-5'] },
  { name: 'app-b4-merge-pick-th', Content: MergeScreen, lang: 'th', scheme: 'light', steps: ['merge-b', 'merge-c'] },
  { name: 'app-b5-merge-pages-th', Content: PageManagerScreen, lang: 'th', scheme: 'light', workspace: { purpose: 'merge', docs: ['b', 'c'] } },
  { name: 'app-b6-split-ranges-th', Content: SplitScreen, lang: 'th', scheme: 'light', docId: 'a', steps: [{ type: '1-3, 7-10', into: 'split-input' }] },
  { name: 'app-b7-split-select-th', Content: SplitScreen, lang: 'th', scheme: 'light', docId: 'a', steps: ['split-select', 'page-1', 'page-4'] },
  { name: 'app-b8-to-images-th', Content: ToImagesScreen, lang: 'th', scheme: 'light', docId: 'b', steps: ['fmt-png'] },
  { name: 'app-b9-to-images-en-dark', Content: ToImagesScreen, lang: 'en', scheme: 'dark', docId: 'b', steps: ['mode-select', 'page-2'] },
  { name: 'app-b10-split-source-th', Content: SplitScreen, lang: 'th', scheme: 'light' },
  { name: 'app-b11-to-images-ranges-th', Content: ToImagesScreen, lang: 'th', scheme: 'light', docId: 'a', steps: ['mode-ranges', { type: '1-3, 5, 8-10', into: 'img-ranges' }] },
  { name: 'app-b12-pages-undo-th', Content: PageManagerScreen, lang: 'th', scheme: 'light', workspace: { purpose: 'document', docs: ['b'] }, steps: ['pm-select', 'page-1', 'pm-later', 'pm-select'] },
  { name: 'app-b13-split-overlap-th', Content: SplitScreen, lang: 'th', scheme: 'light', docId: 'a', steps: [{ type: '1-3, 2-4', into: 'split-input' }] },
];

it.each(shots.map((s) => [s.name, s] as const))('%s', async (_name, shot) => {
  await i18n.changeLanguage(shot.lang);
  fs.writeFileSync(path.join(OUT, `${shot.name}.html`), await page(shot));
});
