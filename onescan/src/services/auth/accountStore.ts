import { Platform } from 'react-native';
import { create } from 'zustand';
import { env } from '@/core/config/env';
import { appMeta } from '@/core/identity/appMeta';
import { installationId } from '@/core/identity/installation';
import { AccountInfo, accountApi, DeviceInfo } from './accountApi';
import { AuthError, isAuthError } from './errors';
import { AuthSession, goTrue } from './goTrue';
import { readClaims } from './jwt';
import { sessionStore, StoredSession } from './sessionStore';

/**
 * OneScan Account state (ACCOUNT-1.3-SPEC §5, §7, PHASE 11–13).
 *
 * Rules this module keeps:
 * - Nothing here runs on the startup path except `init`, which reads local storage only — no
 *   network. Scanner, documents, OCR, PDF and search never wait for or depend on it.
 * - It never reads, writes, moves, uploads or deletes documents, and never touches the
 *   document/database encryption keys. Logout and account deletion leave local data as is.
 * - The access token lives in memory only; the refresh token is in SecureStore.
 */

export type AuthStatus = 'LOCAL' | 'AUTHENTICATING' | 'AUTHENTICATED' | 'TOKEN_REFRESHING' | 'OFFLINE_AUTHENTICATED' | 'SESSION_EXPIRED';

/** Owner policy: refresh inactivity 30 days, absolute 90 days. Mirrors the server. */
export const SESSION_INACTIVITY_MS = 30 * 24 * 3600 * 1000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 3600 * 1000;
/** Refresh the access token when it has less than this left. */
const REFRESH_MARGIN_MS = 60 * 1000;
const HEARTBEAT_EVERY_MS = 24 * 3600 * 1000;

const ACCOUNT_KEY = 'account';
const PENDING_EMAIL_KEY = 'account_pending_email';
const HEARTBEAT_KEY = 'account_heartbeat_at';

/** Display cache of the signed-in account (no tokens). */
export type CachedAccount = Pick<AccountInfo, 'email' | 'verified' | 'status' | 'plan' | 'deletionScheduledFor'> & { userId: string | null };

export interface AccountDeps {
  fetcher?: typeof fetch;
  now?: () => number;
}
let deps: AccountDeps = {};
/** Tests only. */
export function setAccountDeps(d: AccountDeps) {
  deps = d;
}
const now = () => (deps.now ?? Date.now)();

/** In-memory access token (never persisted). */
let access: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<string> | null = null;

export const accountConfigured = () => !!env.supabaseUrl && !!env.supabaseAnonKey && !!env.accountApiUrl;

function policyExpired(s: StoredSession, at: number) {
  return at - s.startedAt > SESSION_ABSOLUTE_MS || at - s.lastRefreshAt > SESSION_INACTIVITY_MS;
}

function deviceLabel(): string | null {
  const c = Platform.constants as { Model?: string; Brand?: string; Manufacturer?: string } | undefined;
  const model = c?.Model?.trim();
  if (!model) return null;
  const brand = (c?.Brand ?? c?.Manufacturer ?? '').trim();
  const label = brand && !model.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand[0].toUpperCase()}${brand.slice(1)} ${model}` : model;
  return label.slice(0, 80);
}

async function readCache(): Promise<CachedAccount | null> {
  try {
    const raw = await appMeta.get(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as CachedAccount) : null;
  } catch {
    return null;
  }
}

async function writeCache(a: CachedAccount | null) {
  try {
    if (a) await appMeta.set(ACCOUNT_KEY, JSON.stringify(a));
    else await appMeta.remove(ACCOUNT_KEY);
  } catch {
    // Display cache only.
  }
}

interface AccountState {
  status: AuthStatus;
  account: CachedAccount | null;
  /** Email waiting for verification (after sign-up / unverified sign-in). */
  pendingEmail: string | null;
  /** Recovery session from a reset link: memory only, used once to set a new password. */
  recovery: AuthSession | null;
  initialized: boolean;

  init(): Promise<void>;
  accessToken(): Promise<string>;
  register(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  completeLink(tokenHash: string, type: 'email' | 'recovery'): Promise<'verified' | 'recovery'>;
  /**
   * Email link that already carries a session (Supabase's default templates: `/verify` redirects
   * with tokens in the fragment). `verified_login` = signed in; `verified` = verified, sign in next.
   */
  completeSessionLink(link: SessionLink): Promise<'verified' | 'verified_login' | 'recovery'>;
  resetPassword(password: string): Promise<void>;
  refreshAccount(): Promise<CachedAccount | null>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  devices(): Promise<DeviceInfo[]>;
  revokeDevice(id: string): Promise<void>;
  deleteAccount(email: string, password: string): Promise<string>;
  cancelDeletion(): Promise<void>;
  clearPendingEmail(): Promise<void>;
}

export interface SessionLink {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  type: 'email' | 'recovery';
}

export const useAccount = create<AccountState>((set, get) => {
  /** Forget the session on this device (tokens + account cache). Documents are not touched. */
  async function forgetSession(next: AuthStatus = 'LOCAL', keepEmail = false) {
    access = null;
    await sessionStore.clear();
    const cached = get().account;
    await writeCache(null);
    set({ status: next, account: keepEmail && cached ? { ...cached, userId: null } : null });
  }

  async function adopt(session: AuthSession) {
    const t = now();
    access = { token: session.accessToken, expiresAt: session.expiresAt };
    await sessionStore.save({ refreshToken: session.refreshToken, startedAt: t, lastRefreshAt: t });
    const claims = readClaims(session.accessToken);
    const account: CachedAccount = { userId: null, email: claims?.email ?? get().account?.email ?? '', verified: true, status: 'active', plan: 'FREE', deletionScheduledFor: null };
    await writeCache(account);
    await appMeta.remove(PENDING_EMAIL_KEY).catch(() => undefined);
    set({ status: 'AUTHENTICATED', account, pendingEmail: null });
  }

  /** Register this installation and load the account (best effort, never blocks sign-in). */
  async function afterSignIn() {
    try {
      const token = await get().accessToken();
      await accountApi.registerDevice(token, {
        installationId: await installationId(),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        label: deviceLabel(),
        appVersion: env.appVersion || '0',
      }, deps.fetcher);
      await appMeta.set(HEARTBEAT_KEY, String(now())).catch(() => undefined);
    } catch {
      // Device list will be updated on the next sign-in or heartbeat.
    }
    await get().refreshAccount().catch(() => undefined);
  }

  async function doRefresh(): Promise<string> {
    const stored = await sessionStore.load();
    if (!stored) {
      await forgetSession(get().account ? 'SESSION_EXPIRED' : 'LOCAL', true);
      throw new AuthError('session_expired');
    }
    if (policyExpired(stored, now())) {
      await forgetSession('SESSION_EXPIRED', true);
      throw new AuthError('session_expired');
    }
    set({ status: 'TOKEN_REFRESHING' });
    try {
      const s = await goTrue.refresh(stored.refreshToken, deps);
      access = { token: s.accessToken, expiresAt: s.expiresAt };
      await sessionStore.save({ refreshToken: s.refreshToken, startedAt: stored.startedAt, lastRefreshAt: now() });
      set({ status: 'AUTHENTICATED' });
      return s.accessToken;
    } catch (e) {
      if (isAuthError(e, 'session_expired')) {
        await forgetSession('SESSION_EXPIRED', true);
      } else {
        // Offline or server trouble: keep the session and try again later.
        set({ status: 'OFFLINE_AUTHENTICATED' });
      }
      throw e;
    }
  }

  return {
    status: 'LOCAL',
    account: null,
    pendingEmail: null,
    recovery: null,
    initialized: false,

    async init() {
      if (get().initialized) return;
      // Local reads only. No network here: startup and the scanner never wait for the account.
      const [stored, cached, pending] = await Promise.all([
        sessionStore.load(),
        readCache(),
        appMeta.get(PENDING_EMAIL_KEY).catch(() => null),
      ]);
      if (stored && !policyExpired(stored, now())) {
        set({ status: 'AUTHENTICATED', account: cached, pendingEmail: pending, initialized: true });
      } else if (stored) {
        await sessionStore.clear();
        set({ status: 'SESSION_EXPIRED', account: cached ? { ...cached, userId: null } : null, pendingEmail: pending, initialized: true });
        await writeCache(null);
      } else {
        set({ status: 'LOCAL', account: null, pendingEmail: pending, initialized: true });
      }
    },

    async accessToken() {
      if (access && access.expiresAt - now() > REFRESH_MARGIN_MS) return access.token;
      if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
      return refreshing;
    },

    async register(email, password) {
      set({ status: 'AUTHENTICATING' });
      try {
        await goTrue.signUp(email, password, deps);
        await appMeta.set(PENDING_EMAIL_KEY, email).catch(() => undefined);
        set({ pendingEmail: email });
      } finally {
        set({ status: get().account && access ? 'AUTHENTICATED' : 'LOCAL' });
      }
    },

    async login(email, password) {
      const before = get().status;
      set({ status: 'AUTHENTICATING' });
      try {
        await adopt(await goTrue.signIn(email, password, deps));
      } catch (e) {
        if (isAuthError(e, 'email_not_confirmed')) {
          await appMeta.set(PENDING_EMAIL_KEY, email).catch(() => undefined);
          set({ pendingEmail: email });
        }
        set({ status: before === 'AUTHENTICATING' ? 'LOCAL' : before });
        throw e;
      }
      await afterSignIn();
    },

    resendVerification: (email) => goTrue.resendVerification(email, deps),
    requestPasswordReset: (email) => goTrue.requestPasswordReset(email, deps),

    async completeLink(tokenHash, type) {
      const session = await goTrue.verifyLink(tokenHash, type, deps);
      if (type === 'recovery') {
        set({ recovery: session });
        return 'recovery';
      }
      await adopt(session);
      await afterSignIn();
      return 'verified';
    },

    async completeSessionLink(link) {
      // The tokens came in through a deep link that any app could send: confirm them with
      // Supabase before use, and never let a verification link switch this device to an
      // account other than the one it is waiting on (login CSRF).
      const { email } = await goTrue.getUser(link.accessToken, deps);
      const session: AuthSession = { accessToken: link.accessToken, refreshToken: link.refreshToken, expiresAt: link.expiresAt };
      if (link.type === 'recovery') {
        set({ recovery: session });
        return 'recovery';
      }
      const pending = get().pendingEmail;
      const isPending = !!email && !!pending && email.toLowerCase() === pending.toLowerCase();
      // Already signed in on this device: keep that session.
      if (!isPending || (await sessionStore.load())) {
        if (isPending) {
          await appMeta.remove(PENDING_EMAIL_KEY).catch(() => undefined);
          set({ pendingEmail: null });
        }
        return 'verified';
      }
      await adopt(session);
      await afterSignIn();
      return 'verified_login';
    },

    async resetPassword(password) {
      const r = get().recovery;
      if (!r) throw new AuthError('expired_link');
      await goTrue.updatePassword(r.accessToken, password, deps);
      // Policy: a new password ends every session, including any on this device. The local
      // documents and their encryption keys are not related to the password and stay as they are.
      await goTrue.signOut(r.accessToken, 'global', deps).catch(() => undefined);
      set({ recovery: null });
      await forgetSession('LOCAL');
    },

    async refreshAccount() {
      const token = await get().accessToken();
      let info: AccountInfo;
      try {
        info = await accountApi.me(token, deps.fetcher);
      } catch (e) {
        // Signed out from another device / everywhere / by a password reset.
        if (isAuthError(e, 'session_expired')) await forgetSession('SESSION_EXPIRED', true);
        throw e;
      }
      const account: CachedAccount = { userId: info.userId, email: info.email, verified: info.verified, status: info.status, plan: info.plan, deletionScheduledFor: info.deletionScheduledFor };
      await writeCache(account);
      set({ account, status: 'AUTHENTICATED' });
      // Daily heartbeat keeps "last active" in the device list honest.
      const last = Number((await appMeta.get(HEARTBEAT_KEY).catch(() => null)) ?? 0);
      if (now() - last > HEARTBEAT_EVERY_MS) {
        await accountApi.heartbeat(token, env.appVersion || '0', deps.fetcher).catch(() => undefined);
        await appMeta.set(HEARTBEAT_KEY, String(now())).catch(() => undefined);
      }
      return account;
    },

    async logout() {
      // Best effort on the server; this device signs out even offline.
      try {
        const token = await get().accessToken();
        await accountApi.logoutCurrent(token, deps.fetcher).catch(() => undefined);
        await goTrue.signOut(token, 'local', deps).catch(() => undefined);
      } catch {
        // no usable token: nothing to revoke remotely
      }
      await forgetSession('LOCAL');
    },

    async logoutAll() {
      // Needs the server: if it fails, this device stays signed in and the user can retry.
      const token = await get().accessToken();
      await accountApi.revokeAll(token, deps.fetcher);
      await forgetSession('LOCAL');
    },

    async devices() {
      return accountApi.devices(await get().accessToken(), deps.fetcher);
    },

    async revokeDevice(id) {
      await accountApi.revokeDevice(await get().accessToken(), id, deps.fetcher);
    },

    async deleteAccount(email, password) {
      // Fresh password sign-in proves it is the owner (the API checks it is < 5 minutes old).
      const s = await goTrue.signIn(email, password, deps);
      access = { token: s.accessToken, expiresAt: s.expiresAt };
      const { scheduled_for } = await accountApi.requestDeletion(s.accessToken, deps.fetcher);
      // The server has ended every session. Local documents stay on this device.
      await forgetSession('LOCAL');
      return scheduled_for;
    },

    async cancelDeletion() {
      await accountApi.cancelDeletion(await get().accessToken(), deps.fetcher);
      await get().refreshAccount();
    },

    async clearPendingEmail() {
      await appMeta.remove(PENDING_EMAIL_KEY).catch(() => undefined);
      set({ pendingEmail: null });
    },
  };
});
