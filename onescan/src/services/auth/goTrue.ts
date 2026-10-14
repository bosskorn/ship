import { env } from '@/core/config/env';
import { AuthError, mapAuthError } from './errors';
import { bodyOf, request } from './http';

/**
 * Minimal client for Supabase Auth's REST API. Supabase does the authentication (password
 * hashing, verification and reset tokens, sessions, refresh-token rotation); this only carries
 * requests and maps errors. It keeps no state.
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
}

export interface GoTrueDeps {
  fetcher?: typeof fetch;
  now?: () => number;
}

const configured = () => !!env.supabaseUrl && !!env.supabaseAnonKey;
/**
 * Where verification and reset emails send the user. Production: the verified App Link
 * `https://<appLinkHost>/auth/link` (Android opens OneScan directly; never a custom scheme).
 * QA builds without a host: the OneScan API's `/auth/link`.
 */
export const emailRedirectUrl = () => (env.appLinkHost ? `https://${env.appLinkHost}/auth/link` : `${env.accountApiUrl}/auth/link`);

function headers(accessToken?: string): Record<string, string> {
  return { apikey: env.supabaseAnonKey, authorization: `Bearer ${accessToken ?? env.supabaseAnonKey}`, 'content-type': 'application/json' };
}

async function call<T>(path: string, init: RequestInit, op: 'verify' | 'refresh' | 'other', deps: GoTrueDeps): Promise<T | null> {
  if (!configured()) throw new AuthError('not_configured');
  const res = await request(`${env.supabaseUrl}/auth/v1${path}`, init, deps.fetcher);
  const body = await bodyOf<T & { error_code?: string; error?: string }>(res);
  if (!res.ok) throw new AuthError(mapAuthError(res.status, body, op));
  return body;
}

function toSession(t: TokenResponse | null, now: number): AuthSession {
  if (!t?.access_token || !t.refresh_token) throw new AuthError('unknown');
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at ? t.expires_at * 1000 : now + t.expires_in * 1000 };
}

export const goTrue = {
  /** Creates the account; Supabase emails a verification link. Never signs in (no session). */
  async signUp(email: string, password: string, deps: GoTrueDeps = {}): Promise<void> {
    const user = await call<{ identities?: unknown[]; id?: string }>(`/signup?redirect_to=${encodeURIComponent(emailRedirectUrl())}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    }, 'other', deps);
    // With email confirmation on, an address that already has an account comes back as a user
    // with no identities (and no email is sent).
    if (user && Array.isArray(user.identities) && user.identities.length === 0) throw new AuthError('email_exists');
  },

  async signIn(email: string, password: string, deps: GoTrueDeps = {}): Promise<AuthSession> {
    const t = await call<TokenResponse>('/token?grant_type=password', { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) }, 'other', deps);
    return toSession(t, (deps.now ?? Date.now)());
  },

  /** Rotates the refresh token: the old one stops working. */
  async refresh(refreshToken: string, deps: GoTrueDeps = {}): Promise<AuthSession> {
    const t = await call<TokenResponse>('/token?grant_type=refresh_token', { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: refreshToken }) }, 'refresh', deps);
    return toSession(t, (deps.now ?? Date.now)());
  },

  /** Ends this session (`local`), every session (`global`) or all but this one (`others`). */
  async signOut(accessToken: string, scope: 'local' | 'global' | 'others', deps: GoTrueDeps = {}): Promise<void> {
    await call(`/logout?scope=${scope}`, { method: 'POST', headers: headers(accessToken) }, 'other', deps);
  },

  /** Same response whether or not the address has an account. */
  async requestPasswordReset(email: string, deps: GoTrueDeps = {}): Promise<void> {
    await call(`/recover?redirect_to=${encodeURIComponent(emailRedirectUrl())}`, { method: 'POST', headers: headers(), body: JSON.stringify({ email }) }, 'other', deps);
  },

  async resendVerification(email: string, deps: GoTrueDeps = {}): Promise<void> {
    await call(`/resend?redirect_to=${encodeURIComponent(emailRedirectUrl())}`, { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'signup', email }) }, 'other', deps);
  },

  /** Exchanges a one-time email-link token for a session (verification or recovery). */
  async verifyLink(tokenHash: string, type: 'email' | 'recovery', deps: GoTrueDeps = {}): Promise<AuthSession> {
    const t = await call<TokenResponse>('/verify', { method: 'POST', headers: headers(), body: JSON.stringify({ type, token_hash: tokenHash }) }, 'verify', deps);
    return toSession(t, (deps.now ?? Date.now)());
  },

  /** Asks Supabase who owns an access token (validates it server side; claims alone are not trusted). */
  async getUser(accessToken: string, deps: GoTrueDeps = {}): Promise<{ email: string | null }> {
    const u = await call<{ email?: string }>('/user', { method: 'GET', headers: headers(accessToken) }, 'verify', deps);
    return { email: typeof u?.email === 'string' ? u.email : null };
  },

  async updatePassword(accessToken: string, password: string, deps: GoTrueDeps = {}): Promise<void> {
    await call('/user', { method: 'PUT', headers: headers(accessToken), body: JSON.stringify({ password }) }, 'other', deps);
  },
};
