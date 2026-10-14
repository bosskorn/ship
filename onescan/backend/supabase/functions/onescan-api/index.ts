/**
 * OneScan API on Supabase Edge Functions (Deno). Same routes and rules as the Cloudflare Worker
 * (`backend/api`); this file only adapts the host:
 *  - `app.*` functions are called over the function's own database connection (SUPABASE_DB_URL,
 *    injected by Supabase), so no service-role key is stored anywhere and the `app` schema stays
 *    unexposed to the REST API;
 *  - Supabase serves no HTML from functions: `/auth/link` redirects, legal pages are plain text;
 *  - rate limits are per function instance (best effort; the Worker uses Cloudflare's limiter).
 * Deploy with JWT verification OFF: the API verifies Supabase access tokens itself (ES256 JWKS),
 * and the link/legal routes are public. Build: `node backend/supabase/functions/build.mjs`.
 */
import postgres from 'npm:postgres@3.4.4';
import { DbError } from '../../../api/src/db';
import type { Env, RateLimit } from '../../../api/src/env';
import { handle } from '../../../api/src/index';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void };

const FUNCTIONS = new Set(['me', 'register_device', 'heartbeat', 'list_devices', 'logout_current', 'revoke_all', 'revoke_device', 'request_deletion', 'cancel_deletion']);
const ARG = /^p_[a-z_]{1,30}$/;

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });

async function DB_CALL(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const names = Object.keys(args);
  if (!FUNCTIONS.has(fn) || !names.every((n) => ARG.test(n))) throw new DbError(500);
  const text = `select app.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  try {
    const rows = await sql.unsafe(text, names.map((n) => (args[n] ?? null) as string | null));
    return rows[0]?.r ?? null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.error(JSON.stringify({ db_error: code ?? 'unknown', fn }));
    throw new DbError(500, code);
  }
}

function limiter(limit: number, periodMs: number): RateLimit {
  const hits = new Map<string, { n: number; until: number }>();
  return {
    async limit({ key }) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.until <= now) {
        if (hits.size > 10_000) hits.clear();
        hits.set(key, { n: 1, until: now + periodMs });
        return { success: true };
      }
      h.n += 1;
      return { success: h.n <= limit };
    },
  };
}

const env: Env = {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  ANDROID_PACKAGE: 'app.onescan.mobile',
  ANDROID_CERT_SHA256: '1C:10:56:5D:4E:EA:96:33:23:5B:78:8C:E0:0B:F3:EF:72:B7:84:61:89:9D:D9:29:69:1F:AF:C0:F0:E9:60:A8',
  RL_API: limiter(60, 60_000),
  RL_SENSITIVE: limiter(5, 60_000),
  DB_CALL,
  PLAIN_PAGES: true,
};

Deno.serve(async (req) => {
  // Requests arrive as /onescan-api/<route>.
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/onescan-api(?=\/|$)/, '') || '/';
  return handle(new Request(url, req), env);
});
