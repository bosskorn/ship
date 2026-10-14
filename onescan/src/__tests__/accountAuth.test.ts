/**
 * OneScan Account 1.3 — auth layer. Supabase Auth and the OneScan API are simulated with a
 * fetch stub; SecureStore and the app_meta table are in-memory. Spies on the document engine,
 * the native module (encryption keys) and the document repository prove the account never
 * touches local documents or their encryption.
 */
import * as SecureStore from 'expo-secure-store';
import { OneScanVision } from '@/native/OneScanVision';
import { setAccountDeps, SESSION_ABSOLUTE_MS, SESSION_INACTIVITY_MS, useAccount } from '@/services/auth/accountStore';
import { AuthError, mapAuthError } from '@/services/auth/errors';
import { goTrue } from '@/services/auth/goTrue';

// jest.mock calls below are hoisted above these imports by babel-jest.

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));
const mockMeta = new Map<string, string>();
jest.mock('@/core/identity/appMeta', () => ({
  appMeta: {
    get: jest.fn(async (k: string) => mockMeta.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => void mockMeta.set(k, v)),
    setIfAbsent: jest.fn(async (k: string, v: string) => {
      if (!mockMeta.has(k)) mockMeta.set(k, v);
      return mockMeta.get(k)!;
    }),
    remove: jest.fn(async (k: string) => void mockMeta.delete(k)),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('@/core/config/env', () => ({
  env: { apiBaseUrl: '', appVersion: '1.3.0', supabaseUrl: 'https://sb.test', supabaseAnonKey: 'anon-key', accountApiUrl: 'https://api.test' },
}));
// Local-data spies: none of these may be called by any account flow.
jest.mock('@/native/OneScanVision', () => ({
  OneScanVision: { databaseKeyAsync: jest.fn(), encryptFileAsync: jest.fn(), plainUriAsync: jest.fn(), clearPlainCacheAsync: jest.fn() },
}));
jest.mock('@/core/database/repositories/documentRepository', () => ({
  documentRepository: new Proxy({}, { get: (_t, k) => (globalThis as { __docRepoSpy?: jest.Mock }).__docRepoSpy!.bind(null, k) }),
  folderRepository: new Proxy({}, { get: (_t, k) => (globalThis as { __docRepoSpy?: jest.Mock }).__docRepoSpy!.bind(null, k) }),
}));


const docRepoSpy = jest.fn();
(globalThis as { __docRepoSpy?: jest.Mock }).__docRepoSpy = docRepoSpy;

const DAY = 24 * 3600 * 1000;
let clock = Date.UTC(2026, 9, 14);
const SESSION_KEY = 'onescan.account.session.v1';

function jwt(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256' })}.${b64(claims)}.sig`;
}
let tokenSeq = 0;
function tokenPair(email = 'alice@example.com') {
  tokenSeq += 1;
  return {
    access_token: jwt({ sub: 'sub-1', session_id: `sess-${tokenSeq}`, email, exp: Math.floor(clock / 1000) + 900 }),
    refresh_token: `refresh-${tokenSeq}`,
    expires_in: 900,
  };
}

type Reply = { status: number; body?: unknown } | 'network';
interface Server {
  routes: Record<string, Reply | ((body: Record<string, unknown>, headers: Record<string, string>) => Reply)>;
  calls: { key: string; body: Record<string, unknown>; headers: Record<string, string> }[];
}
let server: Server;

function key(url: string, method: string) {
  const u = new URL(url);
  return `${method} ${u.host}${u.pathname}${u.searchParams.get('grant_type') ? `?${u.searchParams.get('grant_type')}` : ''}${u.searchParams.get('scope') ? `?scope=${u.searchParams.get('scope')}` : ''}`;
}

const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const k = key(String(url), init?.method ?? 'GET');
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const headers = (init?.headers ?? {}) as Record<string, string>;
  server.calls.push({ key: k, body, headers });
  const route = server.routes[k];
  const r = typeof route === 'function' ? route(body, headers) : route;
  if (!r || r === 'network') throw new TypeError('Network request failed');
  return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
}) as unknown as typeof fetch;

const ME = { user_id: 'onescan-user-1', email: 'alice@example.com', email_verified: true, status: 'active', plan: 'FREE', deletion_scheduled_for: null };

function happyServer(): Server {
  return {
    calls: [],
    routes: {
      'POST sb.test/auth/v1/signup': { status: 200, body: { id: 'sub-1', identities: [{ id: 'i1' }] } },
      'POST sb.test/auth/v1/token?password': () => ({ status: 200, body: tokenPair() }),
      'POST sb.test/auth/v1/token?refresh_token': () => ({ status: 200, body: tokenPair() }),
      'POST sb.test/auth/v1/logout?scope=local': { status: 204 },
      'POST sb.test/auth/v1/logout?scope=global': { status: 204 },
      'POST sb.test/auth/v1/recover': { status: 200, body: {} },
      'POST sb.test/auth/v1/resend': { status: 200, body: {} },
      'POST sb.test/auth/v1/verify': () => ({ status: 200, body: tokenPair() }),
      'PUT sb.test/auth/v1/user': { status: 200, body: { id: 'sub-1' } },
      'GET api.test/v1/me': { status: 200, body: ME },
      'POST api.test/v1/devices/register': { status: 200, body: { device_id: 'd1' } },
      'POST api.test/v1/devices/heartbeat': { status: 200, body: { ok: true } },
      'GET api.test/v1/devices': { status: 200, body: { devices: [{ device_id: 'd1', platform: 'android', device_label: 'Pixel 9', app_version: '1.3.0', last_seen_at: '2026-10-14T00:00:00Z', current: true }] } },
      'POST api.test/v1/devices/current/logout': { status: 200, body: { ok: true } },
      'POST api.test/v1/devices/revoke-all': { status: 200, body: { ok: true } },
      'POST api.test/v1/account/delete': { status: 200, body: { scheduled_for: '2026-10-28T00:00:00Z' } },
      'POST api.test/v1/account/delete/cancel': { status: 200, body: { ok: true } },
    },
  };
}

const called = (k: string) => server.calls.filter((c) => c.key === k);
const stored = () => (mockSecure.get(SESSION_KEY) ? JSON.parse(mockSecure.get(SESSION_KEY)!) : null);

beforeEach(() => {
  mockSecure.clear();
  mockMeta.clear();
  docRepoSpy.mockClear();
  (OneScanVision as unknown as Record<string, jest.Mock>).databaseKeyAsync.mockClear();
  clock = Date.UTC(2026, 9, 14);
  server = happyServer();
  setAccountDeps({ fetcher, now: () => clock });
  useAccount.setState({ status: 'LOCAL', account: null, pendingEmail: null, recovery: null, initialized: false });
});

afterEach(async () => {
  // Global invariants for every flow: local documents and their keys are never touched, and no
  // request carries document content.
  expect(docRepoSpy).not.toHaveBeenCalled();
  for (const fn of Object.values(OneScanVision as unknown as Record<string, jest.Mock>)) expect(fn).not.toHaveBeenCalled();
  for (const c of server.calls) expect(Object.keys(c.body).join(',')).not.toMatch(/document|page|ocr|pdf|image/i);
});

async function signedIn() {
  await useAccount.getState().init();
  await useAccount.getState().login('alice@example.com', 'secret123');
  server.calls.length = 0;
}

describe('startup (offline-first)', () => {
  it('init reads local storage only: no network, LOCAL when never signed in', async () => {
    await useAccount.getState().init();
    expect(fetcher).not.toHaveBeenCalled();
    expect(useAccount.getState().status).toBe('LOCAL');
  });

  it('a stored session comes back AUTHENTICATED without a network call', async () => {
    await signedIn();
    useAccount.setState({ initialized: false, status: 'LOCAL' });
    (fetcher as jest.Mock).mockClear();
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe('AUTHENTICATED');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('register + email verification', () => {
  it('register sends the verification email but does not sign in', async () => {
    await useAccount.getState().init();
    await useAccount.getState().register('new@example.com', 'secret123');
    const call = called('POST sb.test/auth/v1/signup')[0];
    expect(call.body).toEqual({ email: 'new@example.com', password: 'secret123' });
    expect(call.headers.apikey).toBe('anon-key');
    expect(stored()).toBeNull();
    expect(useAccount.getState().status).toBe('LOCAL');
    expect(useAccount.getState().pendingEmail).toBe('new@example.com');
  });

  it('existing email is reported as email_exists', async () => {
    server.routes['POST sb.test/auth/v1/signup'] = { status: 200, body: { id: 'x', identities: [] } };
    await expect(useAccount.getState().register('alice@example.com', 'secret123')).rejects.toMatchObject({ code: 'email_exists' });
  });

  it('weak password and invalid email are mapped', async () => {
    server.routes['POST sb.test/auth/v1/signup'] = { status: 422, body: { error_code: 'weak_password', msg: 'Password should contain…' } };
    await expect(useAccount.getState().register('a@b.co', 'abcdefgh')).rejects.toMatchObject({ code: 'weak_password' });
    server.routes['POST sb.test/auth/v1/signup'] = { status: 400, body: { error_code: 'email_address_invalid' } };
    await expect(useAccount.getState().register('bad', 'secret123')).rejects.toMatchObject({ code: 'invalid_email' });
  });

  it('resend verification is rate limited by the server', async () => {
    server.routes['POST sb.test/auth/v1/resend'] = { status: 429, body: { error_code: 'over_email_send_rate_limit' } };
    await expect(useAccount.getState().resendVerification('a@b.co')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('verification link signs in and registers this device', async () => {
    await useAccount.getState().init();
    const r = await useAccount.getState().completeLink('pkce_abcdef123456', 'email');
    expect(r).toBe('verified');
    expect(called('POST sb.test/auth/v1/verify')[0].body).toEqual({ type: 'email', token_hash: 'pkce_abcdef123456' });
    expect(useAccount.getState().status).toBe('AUTHENTICATED');
    expect(called('POST api.test/v1/devices/register')[0].body).toMatchObject({ installation_id: '11111111-1111-4111-8111-111111111111', app_version: '1.3.0' });
  });

  it('expired verification link', async () => {
    server.routes['POST sb.test/auth/v1/verify'] = { status: 403, body: { error_code: 'otp_expired' } };
    await expect(useAccount.getState().completeLink('pkce_abcdef123456', 'email')).rejects.toMatchObject({ code: 'expired_link' });
    expect(useAccount.getState().status).not.toBe('AUTHENTICATED');
  });
});

describe('login', () => {
  it('stores only the refresh token (secure storage) and keeps the access token in memory', async () => {
    await signedIn();
    const s = stored();
    expect(s.refreshToken).toMatch(/^refresh-/);
    expect(JSON.stringify(s)).not.toContain('access');
    expect(JSON.stringify([...mockMeta.values()])).not.toMatch(/refresh-|eyJ/);
    expect((SecureStore.setItemAsync as jest.Mock).mock.calls[0][2]).toEqual({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    expect(useAccount.getState().account?.userId).toBe('onescan-user-1');
  });

  it.each([
    [400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 'invalid_credentials'],
    [400, { error_code: 'email_not_confirmed' }, 'email_not_confirmed'],
    [429, { error_code: 'over_request_rate_limit' }, 'rate_limited'],
    [503, { message: 'upstream connect error' }, 'server'],
  ])('maps %i %j to %s', async (status, body, code) => {
    server.routes['POST sb.test/auth/v1/token?password'] = { status, body };
    await useAccount.getState().init();
    await expect(useAccount.getState().login('alice@example.com', 'wrong123')).rejects.toMatchObject({ code });
    expect(useAccount.getState().status).toBe('LOCAL');
    expect(stored()).toBeNull();
  });

  it('unverified email is remembered for the verify screen', async () => {
    server.routes['POST sb.test/auth/v1/token?password'] = { status: 400, body: { error_code: 'email_not_confirmed' } };
    await expect(useAccount.getState().login('new@example.com', 'secret123')).rejects.toBeInstanceOf(AuthError);
    expect(useAccount.getState().pendingEmail).toBe('new@example.com');
  });

  it('network unavailable', async () => {
    server.routes['POST sb.test/auth/v1/token?password'] = 'network';
    await expect(useAccount.getState().login('alice@example.com', 'secret123')).rejects.toMatchObject({ code: 'network' });
  });

  it('sign-in still succeeds when the OneScan API is down (device list catches up later)', async () => {
    server.routes['POST api.test/v1/devices/register'] = { status: 503, body: { error: 'unavailable' } };
    server.routes['GET api.test/v1/me'] = 'network';
    await useAccount.getState().init();
    await useAccount.getState().login('alice@example.com', 'secret123');
    expect(useAccount.getState().status).not.toBe('LOCAL');
    expect(stored()).not.toBeNull();
  });
});

describe('tokens and session policy', () => {
  it('refreshes an expired access token once, rotating the refresh token', async () => {
    await signedIn();
    const before = stored().refreshToken;
    clock += 16 * 60 * 1000;
    const [a, b] = await Promise.all([useAccount.getState().accessToken(), useAccount.getState().accessToken()]);
    expect(a).toBe(b);
    expect(called('POST sb.test/auth/v1/token?refresh_token')).toHaveLength(1);
    expect(called('POST sb.test/auth/v1/token?refresh_token')[0].body).toEqual({ refresh_token: before });
    expect(stored().refreshToken).not.toBe(before);
    expect(stored().lastRefreshAt).toBe(clock);
  });

  it('a valid access token is reused without refreshing', async () => {
    await signedIn();
    clock += 5 * 60 * 1000;
    await useAccount.getState().accessToken();
    expect(called('POST sb.test/auth/v1/token?refresh_token')).toHaveLength(0);
  });

  it('revoked / reused refresh token → SESSION_EXPIRED, tokens cleared, email kept for re-login', async () => {
    await signedIn();
    server.routes['POST sb.test/auth/v1/token?refresh_token'] = { status: 400, body: { error_code: 'refresh_token_already_used' } };
    clock += 20 * 60 * 1000;
    await expect(useAccount.getState().accessToken()).rejects.toMatchObject({ code: 'session_expired' });
    expect(useAccount.getState().status).toBe('SESSION_EXPIRED');
    expect(stored()).toBeNull();
    expect(useAccount.getState().account?.email).toBe('alice@example.com');
  });

  it('offline refresh keeps the session (OFFLINE_AUTHENTICATED) and recovers later', async () => {
    await signedIn();
    server.routes['POST sb.test/auth/v1/token?refresh_token'] = 'network';
    clock += 20 * 60 * 1000;
    await expect(useAccount.getState().accessToken()).rejects.toMatchObject({ code: 'network' });
    expect(useAccount.getState().status).toBe('OFFLINE_AUTHENTICATED');
    expect(stored()).not.toBeNull();
    server.routes['POST sb.test/auth/v1/token?refresh_token'] = () => ({ status: 200, body: tokenPair() });
    await useAccount.getState().accessToken();
    expect(useAccount.getState().status).toBe('AUTHENTICATED');
  });

  it('server error on refresh is not a sign-out', async () => {
    await signedIn();
    server.routes['POST sb.test/auth/v1/token?refresh_token'] = { status: 502 };
    clock += 20 * 60 * 1000;
    await expect(useAccount.getState().accessToken()).rejects.toMatchObject({ code: 'server' });
    expect(stored()).not.toBeNull();
  });

  it('30 days without refresh → expired locally, no network', async () => {
    await signedIn();
    clock += SESSION_INACTIVITY_MS + DAY;
    await expect(useAccount.getState().accessToken()).rejects.toMatchObject({ code: 'session_expired' });
    expect(called('POST sb.test/auth/v1/token?refresh_token')).toHaveLength(0);
    expect(useAccount.getState().status).toBe('SESSION_EXPIRED');
  });

  it('90-day absolute limit even with regular refreshes', async () => {
    await signedIn();
    // Refreshed every 20 days (never inactive) for 80 days: still valid.
    for (let i = 0; i < 4; i++) {
      clock += 20 * DAY;
      await useAccount.getState().accessToken();
    }
    expect(useAccount.getState().status).toBe('AUTHENTICATED');
    // Day 91: past the absolute limit despite recent activity.
    clock += 11 * DAY;
    await expect(useAccount.getState().accessToken()).rejects.toMatchObject({ code: 'session_expired' });
    expect(stored()).toBeNull();
  });

  it('expired at startup → SESSION_EXPIRED without network', async () => {
    await signedIn();
    useAccount.setState({ initialized: false });
    clock += SESSION_ABSOLUTE_MS + DAY;
    (fetcher as jest.Mock).mockClear();
    await useAccount.getState().init();
    expect(useAccount.getState().status).toBe('SESSION_EXPIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('forgot / reset password', () => {
  it('reset request is neutral and needs no account', async () => {
    await useAccount.getState().requestPasswordReset('anyone@example.com');
    expect(called('POST sb.test/auth/v1/recover')[0].body).toEqual({ email: 'anyone@example.com' });
  });

  it('recovery link → new password → every session ends; nothing local changes', async () => {
    await signedIn();
    const r = await useAccount.getState().completeLink('pkce_recovery12345', 'recovery');
    expect(r).toBe('recovery');
    expect(stored()).not.toBeNull(); // recovery session is memory only
    await useAccount.getState().resetPassword('newsecret9');
    expect(called('PUT sb.test/auth/v1/user')[0].body).toEqual({ password: 'newsecret9' });
    expect(called('POST sb.test/auth/v1/logout?scope=global')).toHaveLength(1);
    expect(useAccount.getState().status).toBe('LOCAL');
    expect(stored()).toBeNull();
  });

  it('reset without a valid recovery link fails cleanly', async () => {
    await expect(useAccount.getState().resetPassword('newsecret9')).rejects.toMatchObject({ code: 'expired_link' });
  });
});

describe('logout', () => {
  it('logout revokes this session on the server and clears tokens', async () => {
    await signedIn();
    await useAccount.getState().logout();
    expect(called('POST api.test/v1/devices/current/logout')).toHaveLength(1);
    expect(called('POST sb.test/auth/v1/logout?scope=local')).toHaveLength(1);
    expect(stored()).toBeNull();
    expect(mockMeta.has('account')).toBe(false);
    expect(useAccount.getState().status).toBe('LOCAL');
    // The installation id survives (same device next sign-in).
    const { appMeta } = jest.requireMock('@/core/identity/appMeta') as { appMeta: { remove: jest.Mock } };
    expect(appMeta.remove.mock.calls.map((c) => c[0])).not.toContain('installation_id');
  });

  it('logout works offline', async () => {
    await signedIn();
    for (const k of Object.keys(server.routes)) server.routes[k] = 'network';
    clock += 20 * 60 * 1000;
    await useAccount.getState().logout();
    expect(stored()).toBeNull();
    expect(useAccount.getState().status).toBe('LOCAL');
  });

  it('logout all devices', async () => {
    await signedIn();
    await useAccount.getState().logoutAll();
    expect(called('POST api.test/v1/devices/revoke-all')).toHaveLength(1);
    expect(useAccount.getState().status).toBe('LOCAL');
  });

  it('logout all needs the server: on failure this device stays signed in', async () => {
    await signedIn();
    server.routes['POST api.test/v1/devices/revoke-all'] = { status: 503, body: { error: 'unavailable' } };
    await expect(useAccount.getState().logoutAll()).rejects.toMatchObject({ code: 'server' });
    expect(stored()).not.toBeNull();
  });

  it('devices list and revoke', async () => {
    await signedIn();
    const list = await useAccount.getState().devices();
    expect(list).toEqual([{ deviceId: 'd1', platform: 'android', label: 'Pixel 9', appVersion: '1.3.0', lastSeenAt: '2026-10-14T00:00:00Z', current: true }]);
    server.routes['POST api.test/v1/devices/d2/revoke'] = { status: 200, body: { ok: true } };
    await useAccount.getState().revokeDevice('d2');
    expect(called('POST api.test/v1/devices/d2/revoke')).toHaveLength(1);
  });
});

describe('delete account', () => {
  it('re-authenticates, requests deletion (14-day grace) and signs out; local data untouched', async () => {
    await signedIn();
    const date = await useAccount.getState().deleteAccount('alice@example.com', 'secret123');
    expect(date).toBe('2026-10-28T00:00:00Z');
    expect(called('POST sb.test/auth/v1/token?password')).toHaveLength(1);
    const del = called('POST api.test/v1/account/delete')[0];
    expect(del.headers.authorization).toMatch(/^Bearer /);
    expect(useAccount.getState().status).toBe('LOCAL');
    expect(stored()).toBeNull();
  });

  it('wrong password does not request deletion', async () => {
    await signedIn();
    server.routes['POST sb.test/auth/v1/token?password'] = { status: 400, body: { error_code: 'invalid_credentials' } };
    await expect(useAccount.getState().deleteAccount('alice@example.com', 'nope1234')).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(called('POST api.test/v1/account/delete')).toHaveLength(0);
    expect(stored()).not.toBeNull();
  });

  it('pending deletion is shown after sign-in and can be cancelled', async () => {
    server.routes['GET api.test/v1/me'] = { status: 200, body: { ...ME, status: 'pending_deletion', deletion_scheduled_for: '2026-10-28T00:00:00Z' } };
    await signedIn();
    expect(useAccount.getState().account).toMatchObject({ status: 'pending_deletion', deletionScheduledFor: '2026-10-28T00:00:00Z' });
    server.routes['GET api.test/v1/me'] = { status: 200, body: ME };
    await useAccount.getState().cancelDeletion();
    expect(called('POST api.test/v1/account/delete/cancel')).toHaveLength(1);
    expect(useAccount.getState().account?.status).toBe('active');
  });
});

describe('error mapping never leaks provider text', () => {
  it('unknown provider codes become unknown, not raw messages', () => {
    expect(mapAuthError(418, { msg: 'I am a teapot', error_code: 'teapot' })).toBe('unknown');
    expect(new AuthError('unknown').message).toBe('unknown');
  });

  it('goTrue sends the anon key, never a service key', async () => {
    await goTrue.requestPasswordReset('a@b.co', { fetcher });
    const h = server.calls[0].headers;
    expect(h.apikey).toBe('anon-key');
    expect(h.authorization).toBe('Bearer anon-key');
  });
});
