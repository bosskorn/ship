/**
 * Main screens render in every shipped language and in the long pseudo-locale without
 * crashing and without showing a raw translation key or an empty label.
 */
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import en from '@/core/i18n/locales/en';
import { HomeScreen } from '@/features/home/HomeScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { PrivacyScreen } from '@/features/privacy/PrivacyScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { LanguageScreen } from '@/features/profile/LanguageScreen';
import { OcrLanguageScreen } from '@/features/profile/OcrLanguageScreen';
import { AboutScreen } from '@/features/profile/AboutScreen';
import { AppearanceScreen } from '@/features/profile/AppearanceScreen';
import { ScanQualityScreen } from '@/features/profile/ScanQualityScreen';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/features/documents/documentsStore', () => {
  const state = { documents: [], recent: [], loading: false, refresh: jest.fn(), load: jest.fn() };
  const useDocuments = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  useDocuments.getState = () => state;
  return { useDocuments };
});
jest.mock('@/features/documents/useDocumentActions', () => ({ useDocumentActions: () => ({ open: jest.fn(), sheet: null, dialogs: null, showActions: jest.fn() }) }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));

const screens = { HomeScreen, OnboardingScreen, PrivacyScreen, ProfileScreen, LanguageScreen, OcrLanguageScreen, AboutScreen, AppearanceScreen, ScanQualityScreen };

function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const node = n as { children?: unknown; props?: Record<string, unknown> };
      for (const p of ['accessibilityLabel', 'placeholder']) if (typeof node.props?.[p] === 'string') out.push(node.props[p] as string);
      walk(node.children);
    }
  };
  walk(r.toJSON());
  return out;
}

const KEY_LIKE = new RegExp(`^(${Object.keys(en).join('|')})\\.[a-z0-9_.]+$`);

beforeAll(() => {
  initI18n('en');
});

describe.each(['en', 'th', 'en-XA'])('screens in %s', (lang) => {
  beforeAll(async () => {
    await i18n.changeLanguage(lang);
  });

  it.each(Object.keys(screens))('%s renders translated text', (name) => {
    const Screen = screens[name as keyof typeof screens];
    let r!: ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 760 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <ThemeProvider scheme="light" language={lang}>
            <TToastProvider>
              <Screen />
            </TToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });
    const shown = texts(r).map((s) => s.trim()).filter(Boolean);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((s) => KEY_LIKE.test(s))).toEqual([]);
    if (lang === 'en-XA') {
      // Every visible word went through translation (pseudo text is bracketed), except brand (the V2 wordmark
      // draws "One" + "Scan" in two tones), version and
      // language names (always shown in their own language).
      const raw = shown.filter((s) => /[A-Za-z]{3,}/.test(s) && !/[\[\]áéíóúçñöüřšž]/i.test(s) && !/^(OneScan|One|Scan|English|\d[\d.]*.*)$/.test(s));
      expect(raw).toEqual([]);
    }
    act(() => r.unmount());
  });
});
