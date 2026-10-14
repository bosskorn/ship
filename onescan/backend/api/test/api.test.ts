import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { handle } from '../src/index';
import type { Env } from '../src/env';

const SUPABASE = 'https://test.supabase.co';
const SERVICE_KEY = 'service-role-secret';
const SUB = '6f0f1b4e-1111-4111-8111-111111111111';
const SESSION = '6f0f1b4e-2222-4222-8222-222222222222';
const NOW = 1_800_000_000;

let keys: JWTVerifyGetKey;
let priv: CryptoKey;
let otherPriv: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair('ES256');
  priv = kp.privateKey as CryptoKey;
  otherPriv = (await generateKeyPair('ES256')).privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'ES256' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

async function token(over: Record<string, unknown> = {}, opts: { key?: CryptoKey; iss?: string; exp?: number } = {}) {
  return new SignJWT({ role: 'authenticated', session_id: SESSION, email: 'alice@example.com', amr: [{ method: 'password', timestamp: NOW - 60 }], ...over })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(SUB)
    .setIssuer(opts.iss ?? `${SUPABASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 900)
    .sign(opts.key ?? priv);
}

function env(over: Partial<Env> = {}): Env {
  return { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, ANDROID_PACKAGE: 'app.onescan.mobile', ANDROID_CERT_SHA256: 'AA:BB', ...over };
}

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function db(result: unknown = null, status = 200) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    return new Response(status === 200 ? JSON.stringify(result) : JSON.stringify({ code: 'XX000', message: 'internal detail' }), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

async function call(method: string, path: string, opts: { tok?: string | null; body?: unknown; e?: Env; result?: unknown; status?: number } = {}) {
  const d = db(opts.result, opts.status);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.tok !== null) headers.authorization = `Bearer ${opts.tok ?? (await token())}`;
  const req = new Request(`https://api.onescan.test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handle(req, opts.e ?? env(), { keys, fetcher: d.fetcher, now: () => NOW * 1000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON bodies inspected ad hoc in tests
  return { res, body: (await res.clone().json().catch(() => null)) as any, calls: d.calls };
}

describe('authentication', () => {
  it('health needs no token and touches no backend', async () => {
    const { res, calls } = await call('GET', '/v1/health', { tok: null });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['missing token', null],
    ['garbage', 'not.a.jwt'],
  ])('rejects %s', async (_n, tok) => {
    const { res, body, calls } = await call('GET', '/v1/me', { tok: tok as string | null });
    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a token signed by another key, another issuer, expired, or without a session', async () => {
    for (const tok of [
      await token({}, { key: otherPriv }),
      await token({}, { iss: 'https://evil.example/auth/v1' }),
      await token({}, { exp: Math.floor(Date.now() / 1000) - 120 }),
      await token({ session_id: undefined }),
      await token({ role: 'anon' }),
    ]) {
      const { res } = await call('GET', '/v1/me', { tok });
      expect(res.status).toBe(401);
    }
  });
});

describe('account and devices', () => {
  it('GET /v1/me resolves the caller through the service-role RPC in schema app', async () => {
    const me = { user_id: '0190-uuid', email: 'alice@example.com', email_verified: true, status: 'active', plan: 'FREE' };
    const { res, body, calls } = await call('GET', '/v1/me', { result: me });
    expect(res.status).toBe(200);
    expect(body).toEqual(me);
    expect(calls[0].url).toBe(`${SUPABASE}/rest/v1/rpc/me`);
    expect(calls[0].body).toMatchObject({ p_sub: SUB, p_session: SESSION });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['content-profile']).toBe('app');
    expect(h.authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(JSON.stringify(body)).not.toContain(SERVICE_KEY);
  });

  it('a session ended elsewhere is 401 at once', async () => {
    const { res, body } = await call('GET', '/v1/me', { result: { session_revoked: true } });
    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('registers this installation with the session from the token (not from the body)', async () => {
    const { res, calls } = await call('POST', '/v1/devices/register', {
      body: { installation_id: '11111111-1111-4111-8111-111111111111', platform: 'android', device_label: 'Galaxy S25\u0000', app_version: '1.3.0', session: 'forged' },
      result: { device_id: 'd1' },
    });
    expect(res.status).toBe(200);
    expect(calls[0].body).toEqual({
      p_sub: SUB, p_session: SESSION, p_installation: '11111111-1111-4111-8111-111111111111',
      p_platform: 'android', p_label: 'Galaxy S25', p_app_version: '1.3.0',
    });
  });

  it.each([
    [{ installation_id: 'x', platform: 'android', app_version: '1' }],
    [{ installation_id: '11111111-1111-4111-8111-111111111111', platform: 'windows', app_version: '1' }],
    [{ installation_id: '11111111-1111-4111-8111-111111111111', platform: 'android' }],
  ])('rejects invalid device registration %#', async (body) => {
    const { res, calls } = await call('POST', '/v1/devices/register', { body });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects oversized bodies', async () => {
    const { res } = await call('POST', '/v1/devices/register', { body: { installation_id: '11111111-1111-4111-8111-111111111111', platform: 'android', app_version: '1', pad: 'x'.repeat(5000) } });
    expect(res.status).toBe(400);
  });

  it('lists devices for the current session', async () => {
    const { body, calls } = await call('GET', '/v1/devices', { result: [{ device_id: 'd1', current: true }] });
    expect(body).toEqual({ devices: [{ device_id: 'd1', current: true }] });
    expect(calls[0].body).toEqual({ p_sub: SUB, p_session: SESSION });
  });

  it('revokes one device; another user\'s device is not found', async () => {
    const ok = await call('POST', '/v1/devices/22222222-2222-4222-8222-222222222222/revoke', { result: true });
    expect(ok.res.status).toBe(200);
    expect(ok.calls[0].body).toMatchObject({ p_sub: SUB, p_device: '22222222-2222-4222-8222-222222222222' });
    const other = await call('POST', '/v1/devices/22222222-2222-4222-8222-222222222222/revoke', { result: false });
    expect(other.res.status).toBe(404);
    const bad = await call('POST', '/v1/devices/..%2Fx/revoke', { result: true });
    expect(bad.res.status).toBe(400);
  });

  it('logout current device and logout all', async () => {
    const cur = await call('POST', '/v1/devices/current/logout');
    expect(cur.calls[0].url).toContain('/rpc/logout_current');
    expect(cur.calls[0].body).toEqual({ p_sub: SUB, p_session: SESSION });
    const all = await call('POST', '/v1/devices/revoke-all');
    expect(all.calls[0].url).toContain('/rpc/revoke_all');
  });
});

describe('account deletion', () => {
  it('needs a password sign-in within 5 minutes', async () => {
    const stale = await call('POST', '/v1/account/delete', { tok: await token({ amr: [{ method: 'password', timestamp: NOW - 3600 }] }) });
    expect(stale.res.status).toBe(403);
    expect(stale.body).toEqual({ error: 'reauth_required' });
    const refreshOnly = await call('POST', '/v1/account/delete', { tok: await token({ amr: [{ method: 'otp', timestamp: NOW }] }) });
    expect(refreshOnly.res.status).toBe(403);
    expect(stale.calls).toHaveLength(0);
    const fresh = await call('POST', '/v1/account/delete', { result: { scheduled_for: '2026-10-28T00:00:00Z' } });
    expect(fresh.res.status).toBe(200);
    expect(fresh.body).toEqual({ scheduled_for: '2026-10-28T00:00:00Z' });
    expect(fresh.calls[0].url).toContain('/rpc/request_deletion');
  });

  it('cancel', async () => {
    expect((await call('POST', '/v1/account/delete/cancel', { result: true })).res.status).toBe(200);
    expect((await call('POST', '/v1/account/delete/cancel', { result: false })).res.status).toBe(404);
  });
});

describe('failure handling and hygiene', () => {
  it('database failure is 503 without internal details', async () => {
    const { res, body } = await call('GET', '/v1/me', { status: 500 });
    expect(res.status).toBe(503);
    expect(body).toEqual({ error: 'unavailable' });
  });

  it('rate limits per user, sensitive routes more strictly', async () => {
    const deny = { limit: async () => ({ success: false }) };
    const allow = { limit: async () => ({ success: true }) };
    expect((await call('GET', '/v1/me', { e: env({ RL_API: deny }) })).res.status).toBe(429);
    expect((await call('GET', '/v1/me', { e: env({ RL_API: allow, RL_SENSITIVE: deny }), result: {} })).res.status).toBe(200);
    expect((await call('POST', '/v1/devices/revoke-all', { e: env({ RL_API: allow, RL_SENSITIVE: deny }) })).res.status).toBe(429);
  });

  it('never accepts documents: unknown routes are 404', async () => {
    for (const p of ['/v1/documents', '/v1/upload', '/v1/ocr', '/v1/sync']) {
      expect((await call('POST', p, { body: { data: 'x' } })).res.status).toBe(404);
    }
  });

  it('logs carry neither tokens nor emails', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tok = await token();
    await call('GET', '/v1/me', { tok, result: { email: 'alice@example.com' } });
    await call('GET', '/v1/me', { tok: 'bad.token.value' });
    const out = spy.mock.calls.flat().join('\n');
    spy.mockRestore();
    expect(out).not.toContain(tok);
    expect(out).not.toContain('alice@example.com');
    expect(out).not.toContain(SUB);
  });

  it('email-link landing page: no custom-scheme hand-off, token dropped from the address bar', async () => {
    const { res } = await call('GET', '/auth/link', { tok: null });
    const page = await res.text();
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page).not.toMatch(/onescan:|intent:/);
    expect(page).toContain('history.replaceState');
  });

  it('serves asset links and legal pages', async () => {
    const al = await call('GET', '/.well-known/assetlinks.json', { tok: null });
    expect(al.body[0].target).toEqual({ namespace: 'android_app', package_name: 'app.onescan.mobile', sha256_cert_fingerprints: ['AA:BB'] });
    for (const p of ['/legal/terms', '/legal/privacy?lang=en']) {
      expect((await call('GET', p, { tok: null })).res.status).toBe(200);
    }
  });
});

describe('Supabase Edge Functions host (no HTML, direct database calls)', () => {
  it('email link redirects to the app without a fragment of its own (the browser keeps the token)', async () => {
    const { res } = await call('GET', '/auth/link', { tok: null, e: env({ PLAIN_PAGES: true }) });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('onescan://auth/callback');
  });

  it('legal pages are plain text with no markup', async () => {
    const { res } = await call('GET', '/legal/privacy?lang=en', { tok: null, e: env({ PLAIN_PAGES: true }) });
    const text = await res.text();
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(text).toContain('OneScan Privacy Policy');
    expect(text).not.toMatch(/<[a-z]/);
  });

  it('calls app functions through DB_CALL, not the REST API', async () => {
    const DB_CALL = vi.fn(async () => ({ user_id: 'u1', email: 'alice@example.com' }));
    const { res, calls } = await call('GET', '/v1/me', { e: env({ DB_CALL }) });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect(DB_CALL).toHaveBeenCalledWith('me', { p_sub: SUB, p_email: 'alice@example.com', p_confirmed_at: null, p_session: SESSION });
  });
});
