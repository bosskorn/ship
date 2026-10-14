/**
 * Renders the Home screen in each review state to HTML (react-native-web), for
 * tools/screens/shoot.js to capture. Data is mocked; nothing touches real documents.
 */
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
import { HomeScreen } from '@/features/home/HomeScreen';
import type { DocumentRecord } from '@/core/document-engine/model';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
const mockState: { recent: DocumentRecord[] } = { recent: [] };

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('@/core/document-engine/ids', () => ({ newId: () => 'shot-id' }));
jest.mock('@/features/scanner/scanSession', () => ({ useScanSession: { getState: () => ({ start: () => undefined }) } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@/features/documents/documentsStore', () => ({
  useDocuments: (sel: (s: object) => unknown) => sel({ recent: mockState.recent, refresh: () => undefined }),
}));
jest.mock('@/features/documents/useDocumentActions', () => ({ useDocumentActions: () => ({ open: jest.fn(), element: null }) }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
// Thumbnails: a drawn page instead of decrypting real files.
jest.mock('@/features/shared/SecureImage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use imports
  const { View } = require('react-native');
  return {
    SecureImage: () => (
      <View style={{ width: '100%', height: '100%', backgroundColor: '#FBFBF9', padding: 6, gap: 3 }}>
        {[0.9, 0.7, 0.8, 0.5, 0.75, 0.6].map((w, i) => (
          <View key={i} style={{ height: 3, width: `${w * 100}%`, backgroundColor: '#C9CED8', borderRadius: 2 }} />
        ))}
      </View>
    ),
  };
});

const now = Date.UTC(2026, 9, 14, 9);
const doc = (id: string, title: string, pages: number, kb: number, daysAgo: number): DocumentRecord => ({
  id, title, docType: 'document', folderId: null, pageCount: pages, sizeBytes: kb * 1024, pdfUri: 'x', thumbnailUri: 't',
  hasSensitive: false, isRedactedCopy: false, createdAt: now - daysAgo * 864e5, updatedAt: now - daysAgo * 864e5, openedAt: null, deletedAt: null, syncState: 'local_only',
});
const DOCS: Record<string, DocumentRecord[]> = {
  th: [doc('1', 'ใบเสร็จร้านกาแฟ', 1, 412, 0), doc('2', 'สัญญาเช่าคอนโด', 6, 3870, 2), doc('3', 'ใบแจ้งหนี้ค่าไฟ ต.ค.', 2, 958, 5)],
  en: [doc('1', 'Coffee receipt', 1, 412, 0), doc('2', 'Apartment lease', 6, 3870, 2), doc('3', 'Electricity bill Oct', 2, 958, 5)],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function page(lang: string, scheme: 'light' | 'dark', withDocs: boolean) {
  mockState.recent = withDocs ? DOCS[lang] : [];
  const App = () => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider scheme={scheme} language={lang}>
        <TToastProvider>
          <HomeScreen />
        </TToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  act(() => root.render(<App />));
  // Android has no <button>; on the web a row button containing an icon button would be
  // split by the HTML parser when the saved file is opened, so save buttons as divs.
  const html = document.getElementById('root')!.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  // react-native-web keeps its generated CSS (base classes + atomic rules) in its own sheet.
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  const css = `<style id="${sheet.id}">${sheet.textContent}</style>`;
  act(() => root.unmount());
  const bg = scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=412">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
${css}<style>html,body{margin:0;background:${bg}} #root{display:flex;min-height:100vh}
*{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body><div id="root">${html}</div></body></html>`;
}

beforeAll(() => {
  initI18n('en');
  fs.mkdirSync(OUT, { recursive: true });
});

it.each([
  ['1-th-light-docs', 'th', 'light', true],
  ['2-en-light-docs', 'en', 'light', true],
  ['3-th-dark-docs', 'th', 'dark', true],
  ['4-th-light-empty', 'th', 'light', false],
  ['5-en-light-empty', 'en', 'light', false],
  ['6-th-dark-empty', 'th', 'dark', false],
  ['7-th-light-docs-360', 'th', 'light', true],
] as const)('%s', async (name, lang, scheme, withDocs) => {
  await i18n.changeLanguage(lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), page(lang, scheme, withDocs));
});
