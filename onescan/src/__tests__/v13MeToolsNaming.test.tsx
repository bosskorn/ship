/** 1.3 owner review: Me layout, permissions screen, Tools catalogue, list rows, scan file names. */
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { useSettings } from '@/core/config/settingsStore';
import { cleanFilePrefix, scanFileName } from '@/features/scanner/fileName';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { MyAccountScreen } from '@/features/account/AccountScreens';
import { PermissionsScreen } from '@/features/onboarding/PermissionsScreen';
import { ToolsScreen } from '@/features/tools/ToolsScreen';
import { DocumentListItem } from '@/features/documents/DocumentListItem';
import type { DocumentRecord } from '@/core/document-engine/model';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
const mockCamera = { granted: false, canAskAgain: true };
jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(async () => mockCamera),
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  },
}));
jest.mock('@/features/home/HomeScreen', () => ({ openScanner: jest.fn() }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null }));
jest.mock('@/core/document-engine/ocr/ocrLanguages', () => ({
  defaultOcrLanguage: 'tha+eng',
  availableOcrLanguages: () => [{ id: 'tha+eng', labelKey: 'ocr_language.thai_english' }],
}));
const mockAccount = {
  status: 'AUTHENTICATED', initialized: true, pendingEmail: null, recovery: null,
  account: { userId: 'u', email: 'alice@example.com', verified: true, status: 'active', plan: 'FREE', deletionScheduledFor: null },
  init: jest.fn(async () => undefined), refreshAccount: jest.fn(async () => null), logout: jest.fn(), cancelDeletion: jest.fn(),
};
jest.mock('@/services/auth/accountStore', () => ({
  useAccount: Object.assign((sel: (s: typeof mockAccount) => unknown) => sel(mockAccount), { getState: () => mockAccount }),
  accountConfigured: () => true,
}));
jest.mock('@/core/config/remoteConfig', () => ({ useFeature: () => true }));
const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router;

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
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language="th">
          <TToastProvider>{el}</TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const ids = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.testID === 'string' && typeof n.type === 'string').map((n) => n.props.testID as string);
const has = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id).length > 0;
const press = async (r: ReactTestRenderer, id: string) =>
  act(async () => r.root.find((n) => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress());

describe('Me tab', () => {
  it('account card first, sign out last, no delete on the Me tab', async () => {
    const r = await render(<ProfileScreen />);
    const order = ids(r);
    expect(order.indexOf('account-my')).toBeGreaterThanOrEqual(0);
    expect(order[order.length - 1]).toBe('account-logout');
    expect(order.indexOf('account-my')).toBeLessThan(order.indexOf('profile-file-name'));
    expect(has(r, 'account-delete')).toBe(false);
    await press(r, 'account-my');
    expect(mockRouter.push).toHaveBeenCalledWith('/account');
  });

  it('delete account lives at the bottom of My account', async () => {
    const r = await render(<MyAccountScreen />);
    const order = ids(r);
    expect(order[order.length - 1]).toBe('account-delete');
    expect(order).toContain('account-devices');
  });
});

describe('permissions screen', () => {
  it('asks for the camera only; files need no permission; skipping is allowed', async () => {
    useSettings.setState({ permissionsIntroSeen: false });
    const r = await render(<PermissionsScreen />);
    expect(has(r, 'permission-camera')).toBe(true);
    expect(has(r, 'permission-files')).toBe(true);
    await press(r, 'permissions-allow');
    const { Camera } = jest.requireMock('expo-camera') as { Camera: { requestCameraPermissionsAsync: jest.Mock } };
    expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(useSettings.getState().permissionsIntroSeen).toBe(true);
  });

  it('"not now" continues without asking', async () => {
    useSettings.setState({ permissionsIntroSeen: false });
    const r = await render(<PermissionsScreen />);
    await press(r, 'permissions-later');
    expect(useSettings.getState().permissionsIntroSeen).toBe(true);
  });
});

describe('tools', () => {
  it('featured scan plus categorised tools', async () => {
    const r = await render(<ToolsScreen />);
    for (const id of ['tool-featured-scan', 'tools-scan', 'tools-import', 'tool-document', 'tool-id', 'tool-receipt', 'tool-image_to_pdf', 'tool-import_pdf']) {
      expect(has(r, id)).toBe(true);
    }
  });
});

describe('documents list rows', () => {
  it('show the name and a type badge, not a page image', async () => {
    const doc = { id: 'd1', title: 'OneScan_2026-10-14_14-30', docType: 'receipt', pageCount: 2, updatedAt: Date.now(), thumbnailUri: 't', hasSensitive: false } as DocumentRecord;
    const r = await render(<DocumentListItem doc={doc} onPress={jest.fn()} />);
    const SecureImage = (jest.requireMock('@/features/shared/SecureImage') as { SecureImage: unknown }).SecureImage;
    expect(r.root.findAll((n) => n.type === SecureImage)).toHaveLength(0);
    expect(r.root.findAll((n) => n.props.children === 'OneScan_2026-10-14_14-30').length).toBeGreaterThan(0);
  });
});

describe('scan file names', () => {
  it('prefix + date and time, Gregorian digits, safe characters', () => {
    const at = new Date(2026, 9, 14, 9, 5).getTime();
    expect(scanFileName('', at)).toBe('OneScan_2026-10-14_09-05');
    expect(scanFileName('ใบเสร็จ', at)).toBe('ใบเสร็จ_2026-10-14_09-05');
    expect(scanFileName(' a/b:c* ', at)).toBe('abc_2026-10-14_09-05');
    expect(cleanFilePrefix('x'.repeat(60))).toHaveLength(40);
  });
});
