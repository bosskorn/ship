/** Privacy Policy / Terms of Use read inside the app: no browser, no network. */
import React from 'react';
import { Linking } from 'react-native';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { LegalScreen } from '@/features/legal/LegalScreen';
import { legalDocument } from '@/features/legal/legalContent';
import { openLegal } from '@/features/account/ui';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router;

beforeAll(() => initI18n('th'));
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  jest.clearAllMocks();
});

function render(doc: 'privacy' | 'terms', lang: 'th' | 'en' = 'th') {
  act(() => void i18n.changeLanguage(lang));
  let r!: ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language={lang}>
          <LegalScreen doc={doc} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const text = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string)
    .join('\n');

describe('in-app legal pages', () => {
  it('privacy policy (Thai): title, date, key points and every section, without opening a browser', () => {
    const spy = jest.spyOn(Linking, 'openURL');
    const r = render('privacy');
    const doc = legalDocument('privacy', 'th');
    const out = text(r);
    expect(out).toContain('นโยบายความเป็นส่วนตัว');
    expect(out).toContain(doc.updated);
    for (const h of doc.highlights!) expect(out).toContain(h.title);
    for (const s of doc.sections) expect(out).toContain(s.title);
    expect(out).toContain('พ.ศ. 2562');
    expect(spy).not.toHaveBeenCalled();
  });

  it('terms (English) and a link to the other document', () => {
    const r = render('terms', 'en');
    const out = text(r);
    expect(out).toContain('Terms of Use');
    expect(out).toContain('Governing law');
    act(() => r.root.find((n) => n.props.testID === 'legal-open-privacy' && typeof n.props.onPress === 'function').props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/legal/privacy');
  });

  it('privacy and terms describe the same facts in both languages', () => {
    for (const d of ['privacy', 'terms'] as const) {
      expect(legalDocument(d, 'th').sections).toHaveLength(legalDocument(d, 'en').sections.length);
    }
    expect(legalDocument('privacy', 'ja').title).toBe('Privacy Policy');
  });

  it('account screens open the in-app page, not a web URL', () => {
    const spy = jest.spyOn(Linking, 'openURL');
    openLegal('privacy');
    expect(mockRouter.push).toHaveBeenCalledWith('/legal/privacy');
    expect(spy).not.toHaveBeenCalled();
  });
});
