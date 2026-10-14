/**
 * Renders first-launch, Home and Documents screens in each review state to HTML
 * (react-native-web), for src/__screens__/shoot.js to capture. Data is mocked; nothing
 * touches real documents.
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
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import type { DocumentRecord } from '@/core/document-engine/model';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
const mockState: { recent: DocumentRecord[] } = { recent: [] };

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('@/core/document-engine/ids', () => ({ newId: () => 'shot-id' }));
jest.mock('@/features/scanner/scanSession', () => ({ useScanSession: { getState: () => ({ start: () => undefined }) } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@/features/documents/documentsStore', () => ({
  useDocuments: (sel?: (s: object) => unknown) => {
    const state = { recent: mockState.recent, documents: mockState.recent, folders: [], tags: [], tagMap: {}, refresh: () => undefined };
    return sel ? sel(state) : state;
  },
}));
jest.mock('@/core/database/repositories/documentRepository', () => ({ folderRepository: { create: jest.fn() }, documentRepository: {} }));
jest.mock('@/core/database/repositories/tagRepository', () => ({ tagRepository: {} }));
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

type Screen = 'home' | 'onboarding' | 'documents';
interface Shot {
  lang: string;
  scheme: 'light' | 'dark';
  screen: Screen;
  docs?: boolean;
  width?: number;
  /** Press these labels in order after the first render (e.g. a tab or "Next"). */
  press?: string[];
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

function pressByText(label: string) {
  const el = Array.from(document.querySelectorAll<HTMLElement>('[role="button"], [role="tab"], button')).find((e) => e.textContent?.trim() === label);
  if (!el) throw new Error(`no button "${label}"`);
  act(() => {
    try {
      el.click();
    } catch {
      // e.g. FlatList.scrollToIndex without layout in jsdom: the state change still applies.
    }
  });
}

function page({ lang, scheme, screen, docs, width = 412, press = [] }: Shot) {
  mockState.recent = docs ? DOCS[lang] : [];
  setWidth(width);
  const Content = { home: HomeScreen, onboarding: OnboardingScreen, documents: DocumentsScreen }[screen];
  const App = () => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider scheme={scheme} language={lang}>
        <TToastProvider>
          <Content />
        </TToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  act(() => root.render(<App />));
  for (const label of press) pressByText(label);
  // Android has no <button>; on the web a row button containing an icon button would be
  // split by the HTML parser when the saved file is opened, so save buttons as divs.
  const html = document.getElementById('root')!.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  // react-native-web keeps its generated CSS (base classes + atomic rules) in its own sheet.
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  const css = `<style id="${sheet.id}">${sheet.textContent}</style>`;
  act(() => root.unmount());
  const bg = scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
${css}<style>html,body{margin:0;background:${bg}} #root{display:flex;min-height:100vh}
*{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body><div id="root">${html}</div></body></html>`;
}

beforeAll(() => {
  initI18n('en');
  fs.mkdirSync(OUT, { recursive: true });
});

type Key = Parameters<typeof i18n.t>[0];
const th = (k: Key) => i18n.getFixedT('th')(k as never) as string;
const en = (k: Key) => i18n.getFixedT('en')(k as never) as string;

const shots: Record<string, () => Shot> = {
  '1-th-light-docs': () => ({ lang: 'th', scheme: 'light', screen: 'home', docs: true }),
  '2-en-light-docs': () => ({ lang: 'en', scheme: 'light', screen: 'home', docs: true }),
  '3-th-dark-docs': () => ({ lang: 'th', scheme: 'dark', screen: 'home', docs: true }),
  '4-th-light-empty': () => ({ lang: 'th', scheme: 'light', screen: 'home' }),
  '5-en-light-empty': () => ({ lang: 'en', scheme: 'light', screen: 'home' }),
  '6-th-dark-empty': () => ({ lang: 'th', scheme: 'dark', screen: 'home' }),
  '7-th-light-docs-360': () => ({ lang: 'th', scheme: 'light', screen: 'home', docs: true, width: 360 }),
  'onboarding-1-th-light': () => ({ lang: 'th', scheme: 'light', screen: 'onboarding' }),
  'onboarding-2-th-light': () => ({ lang: 'th', scheme: 'light', screen: 'onboarding', press: [th('onboarding.next')] }),
  'onboarding-1-en-dark': () => ({ lang: 'en', scheme: 'dark', screen: 'onboarding' }),
  'onboarding-2-en-dark': () => ({ lang: 'en', scheme: 'dark', screen: 'onboarding', press: [en('onboarding.next')] }),
  'folders-empty-th-light': () => ({ lang: 'th', scheme: 'light', screen: 'documents', press: [th('documents.tab_folders')] }),
  'folders-empty-en-dark': () => ({ lang: 'en', scheme: 'dark', screen: 'documents', press: [en('documents.tab_folders')] }),
};

it.each(Object.keys(shots))('%s', async (name) => {
  const shot = shots[name]();
  await i18n.changeLanguage(shot.lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), page(shot));
});
