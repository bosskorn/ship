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
import { ToolsScreen } from '@/features/tools/ToolsScreen';
import { PermissionsScreen } from '@/features/onboarding/PermissionsScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { MyAccountScreen } from '@/features/account/AccountScreens';
import { FileNameScreen } from '@/features/profile/FileNameScreen';

const OUT = process.env.SHOTS_OUT ?? path.join(__dirname, 'out');
jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: true }), requestCameraPermissionsAsync: async () => ({ granted: true }) } }));
jest.mock('@/features/home/HomeScreen', () => ({ openScanner: jest.fn() }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
const mockAccount = {
  status: 'AUTHENTICATED', initialized: true, pendingEmail: null, recovery: null,
  account: { userId: 'u', email: 'officeme.pr@gmail.com', verified: true, status: 'active', plan: 'FREE', deletionScheduledFor: null },
  init: async () => undefined, refreshAccount: async () => null, logout: jest.fn(), cancelDeletion: jest.fn(),
};
jest.mock('@/services/auth/accountStore', () => ({
  useAccount: Object.assign((sel: (s: typeof mockAccount) => unknown) => sel(mockAccount), { getState: () => mockAccount }),
  accountConfigured: () => true,
}));
jest.mock('@/core/config/remoteConfig', () => ({ useFeature: () => true }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function page(Content: React.ComponentType, lang: string, scheme: 'light' | 'dark', width = 412) {
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

const shots: [string, React.ComponentType, string, 'light' | 'dark'][] = [
  ['v13-tools-th-light', ToolsScreen, 'th', 'light'],
  ['v13-tools-en-dark', ToolsScreen, 'en', 'dark'],
  ['v13-permissions-th-light', PermissionsScreen, 'th', 'light'],
  ['v13-me-th-light', ProfileScreen, 'th', 'light'],
  ['v13-myaccount-th-light', MyAccountScreen, 'th', 'light'],
  ['v13-filename-th-light', FileNameScreen, 'th', 'light'],
];

it.each(shots)('%s', async (name, Content, lang, scheme) => {
  await i18n.changeLanguage(lang);
  fs.writeFileSync(path.join(OUT, `${name}.html`), await page(Content, lang, scheme));
});
