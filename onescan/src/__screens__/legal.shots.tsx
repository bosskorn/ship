/** Renders the in-app Privacy Policy / Terms pages to HTML for src/__screens__/shoot.js. */
/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
// @ts-expect-error react-dom ships no types here; only createRoot is used.
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { LegalScreen } from '@/features/legal/LegalScreen';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function page(doc: 'privacy' | 'terms', lang: string, scheme: 'light' | 'dark', width = 412) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  act(() =>
    root.render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme={scheme} language={lang}>
          <LegalScreen doc={doc} />
        </ThemeProvider>
      </SafeAreaProvider>,
    ),
  );
  const html = document.getElementById('root')!.innerHTML.replace(/<button\b/g, '<div').replace(/<\/button>/g, '</div>');
  const sheet = (StyleSheet as unknown as { getSheet: () => { id: string; textContent: string } }).getSheet();
  act(() => root.unmount());
  const bg = scheme === 'dark' ? '#181818' : '#ffffff';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=block">
<style id="${sheet.id}">${sheet.textContent}</style><style>html,body{margin:0;background:${bg}} #root{display:flex;min-height:100vh}
*{font-family:Roboto,"Noto Sans Thai",sans-serif!important}</style></head><body><div id="root">${html}</div></body></html>`;
}

beforeAll(() => {
  initI18n('th');
  fs.mkdirSync(OUT, { recursive: true });
});

const shots: [string, 'privacy' | 'terms', string, 'light' | 'dark', number][] = [
  ['legal-privacy-th-light', 'privacy', 'th', 'light', 412],
  ['legal-privacy-en-dark', 'privacy', 'en', 'dark', 412],
  ['legal-terms-th-light-360', 'terms', 'th', 'light', 360],
];

it.each(shots)('%s', async (name, doc, lang, scheme, width) => {
  await i18n.changeLanguage(lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), page(doc, lang, scheme, width));
});
