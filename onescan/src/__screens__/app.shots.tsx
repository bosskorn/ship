/**
 * Whole-app prototype shots: each screen inside a phone frame with the real navigation
 * bar, rendered with react-native-web for visual review (src/__screens__/shoot.js; files
 * named app-*). Data is mocked; nothing touches real documents.
 */
/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { StyleSheet, View } from 'react-native';
// @ts-expect-error react-dom ships no types here; only createRoot is used.
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { HomeScreen } from '@/features/home/HomeScreen';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { ToolsScreen } from '@/features/tools/ToolsScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { SearchScreen } from '@/features/search/SearchScreen';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { DocumentViewerScreen } from '@/features/viewer/DocumentViewerScreen';
import { AppTabBar } from '@/navigation/AppTabBar';
import { useSettings } from '@/core/config/settingsStore';
import type { DocumentRecord, DraftPage, FolderRecord, PageRecord } from '@/core/document-engine/model';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
const mockState: { docs: DocumentRecord[]; folders: FolderRecord[]; ocr: Record<string, string>; drafts: DraftPage[]; pages: PageRecord[] } = {
  docs: [], folders: [], ocr: {}, drafts: [], pages: [],
};

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('@/core/document-engine/ids', () => ({ newId: () => 'shot-id' }));
jest.mock('@/core/document-engine/DocumentEngine', () => ({ DocumentEngine: { capture: { hasNativeVision: () => true } } }));
jest.mock('@/core/database/repositories/documentRepository', () => ({
  folderRepository: { create: jest.fn() },
  documentRepository: {
    search: async () => mockState.docs.filter((d) => d.id === '3' || d.id === '7'),
    ocrText: async (id: string) => mockState.ocr[id] ?? '',
  },
}));
jest.mock('@/features/scanner/scanSession', () => {
  const state = () => ({ start: () => undefined, pages: mockState.drafts, docType: 'document', editingDocumentId: null });
  return { useScanSession: Object.assign(() => state(), { getState: state }) };
});
jest.mock('@/features/viewer/useDocument', () => ({ useDocument: () => ({ doc: mockState.docs[2], pages: mockState.pages }) }));
jest.mock('@/features/viewer/PageZoomView', () => ({ PageZoomView: () => null }));
jest.mock('@/core/document-engine/storage/diskSpace', () => ({ lowDisk: () => false, isDiskFull: () => false, MIN_FREE_BYTES_SAVE: 0 }));
jest.mock('@/features/scanner/cropStats', () => ({ noteCropAccepted: jest.fn(), noteCropCorrected: jest.fn() }));
jest.mock('@/core/document-engine/image/filters', () => ({ cssFilterFor: {}, pageFilters: ['original', 'auto', 'document', 'color', 'gray', 'bw'] }));
jest.mock('@/features/editor/CropEditor', () => ({ CropEditor: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  Tabs: () => null,
}));
jest.mock('@/features/documents/documentsStore', () => ({
  useDocuments: (sel?: (s: object) => unknown) => {
    const state = { recent: mockState.docs.slice(0, 5), documents: mockState.docs, folders: mockState.folders, loaded: true, refresh: async () => undefined };
    return sel ? sel(state) : state;
  },
}));
jest.mock('@/features/documents/useDocumentActions', () => ({ useDocumentActions: () => ({ open: jest.fn(), element: null }) }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
// Thumbnails: drawn pages (a receipt, a letter, a form…) instead of decrypting real files.
jest.mock('@/features/shared/SecureImage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use imports
  const { View: V } = require('react-native');
  // eslint-disable-next-line react/display-name -- mock component factory
  const page = (lines: number[], head?: string) => ({ style }: { style?: object }) => (
    <V style={[{ width: '100%', height: '100%' }, style, { backgroundColor: '#FBFBF8', padding: '9%', gap: 4, overflow: 'hidden' }]}>
      {head ? <V style={{ height: 8, width: '45%', backgroundColor: head, borderRadius: 2, marginBottom: 4 }} /> : null}
      {lines.map((w, i) => (
        <V key={i} style={{ height: 3, width: `${w * 100}%`, backgroundColor: '#C9CED8', borderRadius: 2 }} />
      ))}
    </V>
  );
  return { SecureImage: page([0.9, 0.7, 0.85, 0.6, 0.8, 0.75, 0.5, 0.9, 0.65], '#3D6FE0') };
});

const now = Date.UTC(2026, 9, 14, 9);
const doc = (id: string, title: string, pages: number, kb: number, daysAgo: number): DocumentRecord => ({
  id, title, docType: 'document', folderId: null, pageCount: pages, sizeBytes: kb * 1024, pdfUri: 'x', thumbnailUri: 't',
  hasSensitive: false, isRedactedCopy: false, createdAt: now - daysAgo * 864e5, updatedAt: now - daysAgo * 864e5, openedAt: null, deletedAt: null, syncState: 'local_only',
});
const DOCS: Record<string, DocumentRecord[]> = {
  th: [
    doc('1', 'ใบเสร็จร้านกาแฟ', 1, 412, 0), doc('2', 'สัญญาเช่าคอนโด', 6, 3870, 2), doc('3', 'ใบแจ้งหนี้ค่าไฟ ต.ค.', 2, 958, 5),
    doc('4', 'สำเนาบัตรประชาชน', 1, 520, 8), doc('5', 'ใบสมัครงาน', 3, 1460, 12), doc('6', 'บันทึกการประชุม', 4, 2210, 20),
    doc('7', 'ใบแจ้งหนี้ค่าไฟ ก.ย.', 2, 940, 33),
  ],
  en: [
    doc('1', 'Coffee receipt', 1, 412, 0), doc('2', 'Apartment lease', 6, 3870, 2), doc('3', 'Electricity bill Oct', 2, 958, 5),
    doc('4', 'ID card copy', 1, 520, 8), doc('5', 'Job application', 3, 1460, 12), doc('6', 'Meeting notes', 4, 2210, 20),
    doc('7', 'Electricity bill Sep', 2, 940, 33),
  ],
};
const folder = (id: string, name: string, itemCount: number): FolderRecord => ({ id, name, systemKey: null, createdAt: now, itemCount });
const FOLDERS: Record<string, FolderRecord[]> = {
  th: [folder('f1', 'งาน', 4), folder('f2', 'บ้าน', 2), folder('f3', 'ภาษี 2569', 7)],
  en: [folder('f1', 'Work', 4), folder('f2', 'Home', 2), folder('f3', 'Taxes 2026', 7)],
};

type Tab = 'index' | 'documents' | 'tools' | 'profile' | 'search' | 'review' | 'viewer';
interface Shot {
  lang: 'th' | 'en';
  scheme: 'light' | 'dark';
  tab: Tab;
  docs?: boolean;
  folders?: boolean;
  width?: number;
  view?: 'list' | 'grid';
  press?: string[];
  /** Long-press these test IDs (enters selection mode). */
  hold?: string[];
  sheet?: boolean;
  /** Type into the search field. */
  type?: string;
  /** Press these test IDs after the long-presses (selection mode). */
  after?: string[];
  /** Review: number of pages in the draft; the second one still processing when set. */
  draft?: number;
  processing?: boolean;
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 915 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 915 });
  window.dispatchEvent(new Event('resize'));
}

function pressByTestId(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no element ${id}`);
  act(() => el.click());
}

const SCREENS: Record<Tab, () => React.ReactElement> = {
  index: () => <HomeScreen />,
  documents: () => <DocumentsScreen />,
  tools: () => <ToolsScreen />,
  profile: () => <ProfileScreen />,
  search: () => <SearchScreen />,
  review: () => <EditorScreen />,
  viewer: () => <DocumentViewerScreen />,
};

async function holdByTestId(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no element ${id}`);
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch', isPrimary: true };
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    await new Promise((r) => setTimeout(r, 900));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
  });
}

async function render(shot: Shot) {
  const width = shot.width ?? 412;
  const height = 915;
  mockState.docs = shot.docs ? DOCS[shot.lang] : [];
  mockState.folders = shot.folders ? FOLDERS[shot.lang] : [];
  mockState.ocr = shot.lang === 'th'
    ? { '3': 'การไฟฟ้านครหลวง ใบแจ้งค่าไฟฟ้า ประจำเดือนตุลาคม 2569 ยอดชำระ 1,284.50 บาท', '7': 'รวมค่าไฟฟ้าและภาษีมูลค่าเพิ่ม 1,102.75 บาท ชำระภายในวันที่ 25 กันยายน' }
    : { '3': 'Metropolitan Electricity Authority, electricity bill for October 2026, amount due 1,284.50 THB', '7': 'Total electricity charge incl. VAT 1,102.75 THB, due by 25 September' };
  mockState.drafts = Array.from({ length: shot.draft ?? 0 }, (_, i) => ({
    id: `p${i}`, sourceUri: 's', processedUri: 'p', width: 1240, height: 1754, filter: 'auto', rotation: 0, processing: shot.processing && i === 0,
  }) as DraftPage);
  mockState.pages = Array.from({ length: 2 }, (_, i) => ({
    id: `pg${i}`, documentId: '3', index: i, imageUri: 'i', sourceUri: 's', previewUri: 'v', width: 1240, height: 1754, filter: 'auto', rotation: 0,
  }) as unknown as PageRecord);
  useSettings.setState({ documentsView: shot.view ?? 'list' });
  setWidth(width);
  const routes = ['index', 'documents', 'scan', 'tools', 'profile'].map((name) => ({ key: name, name }));
  const tabProps = {
    state: { index: routes.findIndex((r) => r.name === shot.tab), routes },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: () => undefined },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as Parameters<typeof AppTabBar>[0];
  const App = () => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider scheme={shot.scheme} language={shot.lang}>
        <TToastProvider>
          <View style={{ width, height, overflow: 'hidden' }}>
            <View style={{ flex: 1 }}>{SCREENS[shot.tab]()}</View>
            {['search', 'review', 'viewer'].includes(shot.tab) ? null : <AppTabBar {...tabProps} />}
          </View>
        </TToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  act(() => root.render(<App />));
  for (const id of shot.press ?? []) pressByTestId(id);
  if (shot.type) {
    const input = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, shot.type);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
  }
  for (const id of shot.hold ?? []) await holdByTestId(id);
  for (const id of shot.after ?? []) pressByTestId(id);
  // Android has no <button>; nested buttons would be split by the HTML parser.
  const html = document.body.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  act(() => root.unmount());
  const bg = shot.scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${shot.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
<style id="${sheet.id}">${sheet.textContent}</style><style>html,body{margin:0;background:${bg};width:${width}px;height:${height}px;overflow:hidden}
#root{display:flex;width:${width}px;height:${height}px} *{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body>${html}</body></html>`;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shots: Record<string, Shot> = {
  'app-01-home-fresh-th': { lang: 'th', scheme: 'light', tab: 'index' },
  'app-02-home-docs-th': { lang: 'th', scheme: 'light', tab: 'index', docs: true },
  'app-02b-home-docs-en': { lang: 'en', scheme: 'light', tab: 'index', docs: true },
  'app-03-documents-list-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, folders: true },
  'app-03b-documents-grid-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, folders: true, view: 'grid' },
  'app-03c-documents-select-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, folders: true, hold: ['doc-2', 'doc-4'] },
  'app-04-folders-empty-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, press: ['chip-folders'] },
  'app-05-folders-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, folders: true, press: ['chip-folders'] },
  'app-06-tools-th': { lang: 'th', scheme: 'light', tab: 'tools' },
  'app-07-me-th': { lang: 'th', scheme: 'light', tab: 'profile' },
  'app-09-home-docs-dark-th': { lang: 'th', scheme: 'dark', tab: 'index', docs: true },
  'app-09b-documents-grid-dark-en': { lang: 'en', scheme: 'dark', tab: 'documents', docs: true, view: 'grid' },
  'app-09c-home-fresh-dark-th': { lang: 'th', scheme: 'dark', tab: 'index' },
  'app-11-search-th': { lang: 'th', scheme: 'light', tab: 'search', docs: true, type: 'ค่าไฟ' },
  'app-11b-search-en-dark': { lang: 'en', scheme: 'dark', tab: 'search', docs: true, type: 'electricity' },
  'app-12-folder-empty-chip-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, press: ['chip-folders'] },
  'app-13-review-3-th': { lang: 'th', scheme: 'light', tab: 'review', draft: 3 },
  'app-13b-review-processing-th': { lang: 'th', scheme: 'light', tab: 'review', draft: 1, processing: true },
  'app-13c-review-filter-en-dark': { lang: 'en', scheme: 'dark', tab: 'review', draft: 2, press: ['editor-edit-tools', 'tool-filter'] },
  'app-13d-review-th': { lang: 'th', scheme: 'light', tab: 'review', draft: 3 },
  'app-03d-select-two-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, view: 'list', hold: ['doc-2'], after: ['doc-4'] },
  'app-03e-move-no-folders-th': { lang: 'th', scheme: 'light', tab: 'documents', docs: true, view: 'list', hold: ['doc-2'], after: ['selection-move'] },
  'app-14-viewer-th': { lang: 'th', scheme: 'light', tab: 'viewer', docs: true },
  'app-14b-viewer-en-dark': { lang: 'en', scheme: 'dark', tab: 'viewer', docs: true },
  'app-10-home-docs-360-th': { lang: 'th', scheme: 'light', tab: 'index', docs: true, width: 360 },
  'app-10b-home-fresh-360-en': { lang: 'en', scheme: 'light', tab: 'index', width: 360 },
};

beforeAll(() => {
  initI18n('en');
  fs.mkdirSync(OUT, { recursive: true });
});

it.each(Object.keys(shots))('%s', async (name) => {
  jest.setTimeout(20000);
  await i18n.changeLanguage(shots[name].lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), await render(shots[name]));
});
