import type { JWTVerifyGetKey } from 'jose';
import { bearer, type Caller, verifyAccessToken } from './auth';
import { DbError, rpc } from './db';
import type { Env, RateLimit } from './env';
import { cleanText, fail, isUuid, json, readJson } from './http';
import { legalPage } from './legal';
import { assetLinks, linkPage } from './link';

/**
 * OneScan API — the boundary for OneScan's own account logic (spec §4). Credentials, email
 * verification, password reset and token issuing stay with Supabase Auth; this Worker only
 * manages OneScan users, devices, entitlements and deletion. It never accepts document,
 * image, OCR or PDF content.
 */

/** A fresh password sign-in is required to delete the account (spec §8). */
const REAUTH_WINDOW_S = 300;

interface Deps {
  keys?: JWTVerifyGetKey;
  fetcher?: typeof fetch;
  now?: () => number;
}

type Handler = (req: Request, env: Env, caller: Caller, deps: Deps, params: string[]) => Promise<Response>;

const routes: { method: string; path: RegExp; sensitive?: boolean; run: Handler }[] = [
  {
    method: 'GET',
    path: /^\/v1\/me$/,
    run: async (_req, env, c, d) => {
      const me = await rpc<Record<string, unknown> | null>(env, 'me', { p_sub: c.sub, p_email: c.email, p_confirmed_at: null, p_session: c.sessionId }, d.fetcher);
      // Session ended elsewhere (device revoked, sign out everywhere, password reset).
      if (me?.session_revoked) return fail('unauthorized', 401);
      return me ? json(me) : fail('not_found', 404);
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/devices\/register$/,
    run: async (req, env, c, d) => {
      const b = await readJson(req);
      const platform = b?.platform;
      const appVersion = cleanText(b?.app_version, 32);
      if (!b || !isUuid(b.installation_id) || (platform !== 'android' && platform !== 'ios') || !appVersion) return fail('bad_request', 400);
      const r = await rpc(env, 'register_device', {
        p_sub: c.sub,
        p_session: c.sessionId,
        p_installation: b.installation_id,
        p_platform: platform,
        p_label: cleanText(b.device_label, 80),
        p_app_version: appVersion,
      }, d.fetcher);
      return json(r);
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/devices\/heartbeat$/,
    run: async (req, env, c, d) => {
      const b = await readJson(req);
      const appVersion = cleanText(b?.app_version, 32);
      if (!appVersion) return fail('bad_request', 400);
      await rpc(env, 'heartbeat', { p_sub: c.sub, p_session: c.sessionId, p_app_version: appVersion }, d.fetcher);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    path: /^\/v1\/devices$/,
    run: async (_req, env, c, d) => json({ devices: await rpc(env, 'list_devices', { p_sub: c.sub, p_session: c.sessionId }, d.fetcher) }),
  },
  {
    method: 'POST',
    path: /^\/v1\/devices\/current\/logout$/,
    run: async (_req, env, c, d) => {
      await rpc(env, 'logout_current', { p_sub: c.sub, p_session: c.sessionId }, d.fetcher);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/devices\/revoke-all$/,
    sensitive: true,
    run: async (_req, env, c, d) => {
      await rpc(env, 'revoke_all', { p_sub: c.sub }, d.fetcher);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/devices\/([^/]+)\/revoke$/,
    sensitive: true,
    run: async (_req, env, c, d, [id]) => {
      if (!isUuid(id)) return fail('bad_request', 400);
      const ok = await rpc<boolean>(env, 'revoke_device', { p_sub: c.sub, p_device: id, p_event: 'DEVICE_REVOKED' }, d.fetcher);
      return ok ? json({ ok: true }) : fail('not_found', 404);
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/account\/delete$/,
    sensitive: true,
    run: async (_req, env, c, d) => {
      const now = Math.floor((d.now ?? Date.now)() / 1000);
      if (c.passwordAuthAt === null || now - c.passwordAuthAt > REAUTH_WINDOW_S) return fail('reauth_required', 403);
      return json(await rpc(env, 'request_deletion', { p_sub: c.sub, p_source: 'app' }, d.fetcher));
    },
  },
  {
    method: 'POST',
    path: /^\/v1\/account\/delete\/cancel$/,
    sensitive: true,
    run: async (_req, env, c, d) => {
      const ok = await rpc<boolean>(env, 'cancel_deletion', { p_sub: c.sub }, d.fetcher);
      return ok ? json({ ok: true }) : fail('not_found', 404);
    },
  },
];

async function limited(rl: RateLimit | undefined, key: string): Promise<boolean> {
  if (!rl) return false;
  try {
    return !(await rl.limit({ key })).success;
  } catch {
    return false;
  }
}

/** Structured log line: route + status only — never tokens, emails, ids or bodies. */
function log(route: string, status: number) {
  console.log(JSON.stringify({ route, status }));
}

export async function handle(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'GET') {
    if (path === '/v1/health') return json({ ok: true });
    if (path === '/auth/link') return linkPage();
    if (path === '/.well-known/assetlinks.json') return assetLinks(env);
    if (path === '/legal/terms') return legalPage('terms', url.searchParams.get('lang'));
    if (path === '/legal/privacy') return legalPage('privacy', url.searchParams.get('lang'));
  }

  const match = routes.map((r) => ({ r, m: path.match(r.path) })).filter((x) => x.m);
  if (!match.length) return fail('not_found', 404);
  const hit = match.find((x) => x.r.method === req.method);
  if (!hit) return fail('method_not_allowed', 405);
  const { r, m } = hit;
  const label = `${r.method} ${r.path.source}`;

  const token = bearer(req);
  const caller = token ? await verifyAccessToken(token, env, deps.keys) : null;
  if (!caller) {
    log(label, 401);
    return fail('unauthorized', 401);
  }
  if ((await limited(env.RL_API, `api:${caller.sub}`)) || (r.sensitive && (await limited(env.RL_SENSITIVE, `sensitive:${caller.sub}`)))) {
    log(label, 429);
    return fail('rate_limited', 429);
  }
  try {
    const res = await r.run(req, env, caller, deps, m!.slice(1));
    log(label, res.status);
    return res;
  } catch (e) {
    const status = e instanceof DbError && e.pgCode === 'P0002' ? 404 : 503;
    log(label, status);
    return status === 404 ? fail('not_found', 404) : fail('unavailable', 503);
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
