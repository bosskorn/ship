/**
 * Account screens: validation, consent, user-facing errors (never raw provider text), and the
 * Me tab staying the 1.2 settings screen when the account is not available.
 */
import React from 'react';
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import { ForgotPasswordScreen, LoginScreen, parseLink, parseSessionLink, RegisterScreen, VerifyEmailScreen } from '@/features/account/AuthScreens';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { AuthError } from '@/services/auth/errors';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
const mockAccount = {
  status: 'LOCAL', account: null, pendingEmail: 'new@example.com', initialized: true, recovery: null,
  init: jest.fn(async () => undefined),
  login: jest.fn(),
  register: jest.fn(),
  resendVerification: jest.fn(),
  requestPasswordReset: jest.fn(async () => undefined),
  clearPendingEmail: jest.fn(),
};
jest.mock('@/services/auth/accountStore', () => ({
  useAccount: Object.assign((sel: (s: typeof mockAccount) => unknown) => sel(mockAccount), { getState: () => mockAccount }),
  accountConfigured: () => false,
}));


const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router;

beforeAll(() => initI18n('th'));

/** Every rendered tree is unmounted after its test (stops timers such as the resend cooldown). */
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
});

function render(el: React.ReactElement, lang = 'th') {
  void i18n.changeLanguage(lang);
  let r!: ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 760 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language={lang}>
          <TToastProvider>{el}</TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const byId = (r: ReactTestRenderer, id: string) => r.root.find((n) => n.props.testID === id && typeof n.props.onPress === 'function');
const text = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string).join(' | ');
const input = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.find((n) => n.props.testID === id && typeof n.props.onChangeText === 'function');
async function press(r: ReactTestRenderer, id: string) {
  await act(async () => {
    byId(r, id).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccount.login.mockReset();
  mockAccount.register.mockReset();
});

describe('Register', () => {
  it('validates email, password policy, matching passwords and consent before calling the server', async () => {
    const r = render(<RegisterScreen />);
    act(() => input(r, 'register-email').props.onChangeText('not-an-email'));
    act(() => input(r, 'register-password').props.onChangeText('abcdefgh'));
    act(() => input(r, 'register-confirm').props.onChangeText('abcdefgx'));
    await press(r, 'register-submit');
    const t = text(r);
    expect(t).toContain('รูปแบบอีเมลไม่ถูกต้อง');
    expect(t).toContain('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    expect(t).toContain('รหัสผ่านไม่ตรงกัน');
    expect(t).toContain('โปรดยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว');
    expect(mockAccount.register).not.toHaveBeenCalled();
  });

  it('valid form registers (normalised email) and goes to email verification, not into the app', async () => {
    mockAccount.register.mockResolvedValueOnce(undefined);
    const r = render(<RegisterScreen />);
    act(() => input(r, 'register-email').props.onChangeText('  New@Example.com '));
    act(() => input(r, 'register-password').props.onChangeText('secret123'));
    act(() => input(r, 'register-confirm').props.onChangeText('secret123'));
    await press(r, 'register-consent');
    await press(r, 'register-submit');
    expect(mockAccount.register).toHaveBeenCalledWith('new@example.com', 'secret123');
    expect(mockRouter.replace).toHaveBeenCalledWith('/account/verify');
  });

  it('duplicate email shows a friendly message with a sign-in action', async () => {
    mockAccount.register.mockRejectedValueOnce(new AuthError('email_exists'));
    const r = render(<RegisterScreen />);
    act(() => input(r, 'register-email').props.onChangeText('alice@example.com'));
    act(() => input(r, 'register-password').props.onChangeText('secret123'));
    act(() => input(r, 'register-confirm').props.onChangeText('secret123'));
    await press(r, 'register-consent');
    await press(r, 'register-submit');
    expect(text(r)).toContain('อีเมลนี้มีบัญชี OneScan อยู่แล้ว');
  });
});

describe('Login', () => {
  it.each([
    ['invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
    ['email_not_confirmed', 'ยังไม่ได้ยืนยันอีเมล'],
    ['network', 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต'],
    ['rate_limited', 'ลองหลายครั้งเกินไป'],
    ['server', 'บริการบัญชีไม่พร้อมใช้งานชั่วคราว'],
  ] as const)('%s → user-facing Thai text', async (code, expected) => {
    mockAccount.login.mockRejectedValueOnce(new AuthError(code));
    const r = render(<LoginScreen />);
    act(() => input(r, 'login-email').props.onChangeText('alice@example.com'));
    act(() => input(r, 'login-password').props.onChangeText('whatever1'));
    await press(r, 'login-submit');
    expect(text(r)).toContain(expected);
    expect(text(r)).not.toMatch(/invalid_|error_code|Supabase|AuthError/);
  });

  it('success returns to Me', async () => {
    mockAccount.login.mockResolvedValueOnce(undefined);
    const r = render(<LoginScreen />);
    act(() => input(r, 'login-email').props.onChangeText('alice@example.com'));
    act(() => input(r, 'login-password').props.onChangeText('secret123'));
    await press(r, 'login-submit');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/profile');
  });

  it('English copy', async () => {
    mockAccount.login.mockRejectedValueOnce(new AuthError('invalid_credentials'));
    const r = render(<LoginScreen />, 'en');
    act(() => input(r, 'login-email').props.onChangeText('alice@example.com'));
    act(() => input(r, 'login-password').props.onChangeText('x1234567'));
    await press(r, 'login-submit');
    expect(text(r)).toContain('Incorrect email or password');
  });
});

describe('Verify / Forgot', () => {
  it('verify shows the address and holds resend for the cooldown', () => {
    const r = render(<VerifyEmailScreen />);
    expect(text(r)).toContain('new@example.com');
    expect(byId(r, 'verify-resend').props.disabled).toBe(true);
  });

  it('after tapping the email link anywhere, "confirmed — sign in" opens login with the email filled in', async () => {
    const r = render(<VerifyEmailScreen />);
    expect(text(r)).toContain('ยืนยันแล้ว เข้าสู่ระบบ');
    await press(r, 'verify-done');
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/account/login', params: { email: 'new@example.com' } });
  });

  it('forgot password always shows the same neutral confirmation', async () => {
    const r = render(<ForgotPasswordScreen />);
    act(() => input(r, 'forgot-email').props.onChangeText('nobody@example.com'));
    await press(r, 'forgot-submit');
    expect(mockAccount.requestPasswordReset).toHaveBeenCalledWith('nobody@example.com');
    expect(text(r)).toContain('หากอีเมลนี้เชื่อมกับบัญชี OneScan');
  });
});

describe('email links', () => {
  it('reads the token from the fragment (App Link) or query (bridge page) and rejects anything else', () => {
    expect(parseLink('https://api.onescan.app/auth/link#token_hash=pkce_abc12345&type=email')).toEqual({ tokenHash: 'pkce_abc12345', type: 'email' });
    expect(parseLink('onescan://auth/callback?token_hash=pkce_abc12345&type=recovery')).toEqual({ tokenHash: 'pkce_abc12345', type: 'recovery' });
    expect(parseLink(null, { token_hash: 'pkce_abc12345', type: 'email' })).toEqual({ tokenHash: 'pkce_abc12345', type: 'email' });
    expect(parseLink('onescan://auth/callback?token_hash=<script>&type=email')).toBeNull();
    expect(parseLink('onescan://auth/callback?token_hash=pkce_abc12345&type=magiclink')).toBeNull();
    expect(parseLink('onescan://auth/callback')).toBeNull();
  });

  it('reads session links from the fragment and rejects junk', () => {
    const at = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';
    expect(parseSessionLink(`onescan://auth/callback#access_token=${at}&expires_at=1791990000&expires_in=3600&refresh_token=abcdefgh12&token_type=bearer&type=signup`, 0)).toEqual({ accessToken: at, refreshToken: 'abcdefgh12', expiresAt: 1791990000000, type: 'email' });
    expect(parseSessionLink(`onescan://auth/callback#access_token=${at}&expires_in=3600&refresh_token=abcdefgh12&type=recovery`, 1000)).toMatchObject({ type: 'recovery', expiresAt: 1000 + 3600_000 });
    expect(parseSessionLink('onescan://auth/callback#error=access_denied&error_code=otp_expired')).toBe('error');
    expect(parseSessionLink(`onescan://auth/callback#access_token=${at}&refresh_token=abcdefgh12&type=magiclink`)).toBeNull();
    expect(parseSessionLink('onescan://auth/callback#access_token=<script>&refresh_token=abcdefgh12&type=signup')).toBeNull();
    expect(parseSessionLink('onescan://auth/callback?access_token=x')).toBeNull();
  });
});

describe('Me tab without account services', () => {
  it('is the 1.2 settings screen: no account entry, no sign-in wall', () => {
    const r = render(<ProfileScreen />);
    expect(r.root.findAll((n) => n.props.testID === 'account-entry')).toHaveLength(0);
    expect(text(r)).not.toContain('OneScan Account');
    expect(text(r)).toContain('ภาษา');
  });
});
