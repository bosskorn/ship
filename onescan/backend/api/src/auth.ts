import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

/** Caller identity from a verified Supabase access token. */
export interface Caller {
  /** Provider subject (auth.users.id) — mapped to the OneScan user_id in the database. */
  sub: string;
  /** Provider session id: identifies this device's session for logout/revoke. */
  sessionId: string;
  email: string | null;
  /** Seconds since epoch of the most recent password authentication, if any. */
  passwordAuthAt: number | null;
}

let remoteJwks: { url: string; get: JWTVerifyGetKey } | null = null;

function jwksFor(env: Env): JWTVerifyGetKey {
  const url = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  if (!remoteJwks || remoteJwks.url !== url) remoteJwks = { url, get: createRemoteJWKSet(new URL(url)) };
  return remoteJwks.get;
}

/**
 * Verifies signature, issuer, audience and expiry (15-minute access tokens). Returns null for
 * anything invalid; the reason is never echoed to the client.
 */
export async function verifyAccessToken(token: string, env: Env, keys?: JWTVerifyGetKey): Promise<Caller | null> {
  try {
    const opts = { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: 'authenticated', clockTolerance: 30 };
    const { payload } = env.SUPABASE_JWT_SECRET && !keys
      ? await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), { ...opts, algorithms: ['HS256'] })
      : await jwtVerify(token, keys ?? jwksFor(env), { ...opts, algorithms: ['ES256', 'RS256'] });
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || typeof payload.session_id !== 'string') return null;
    const amr = Array.isArray(payload.amr) ? (payload.amr as { method?: string; timestamp?: number }[]) : [];
    const pw = amr.filter((a) => a.method === 'password' && typeof a.timestamp === 'number').map((a) => a.timestamp as number);
    return {
      sub: payload.sub,
      sessionId: payload.session_id,
      email: typeof payload.email === 'string' ? payload.email : null,
      passwordAuthAt: pw.length ? Math.max(...pw) : null,
    };
  } catch {
    return null;
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  const m = h?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  return m ? m[1] : null;
}
