import { env } from '@/core/config/env';
import { AuthError, AuthErrorCode } from './errors';
import { bodyOf, request } from './http';

/** Client for the OneScan API (account, devices, deletion). Never sends documents. */

export interface AccountInfo {
  userId: string;
  email: string;
  verified: boolean;
  status: 'active' | 'pending_deletion';
  plan: 'FREE' | 'PLUS' | 'BUSINESS';
  deletionScheduledFor: string | null;
}

export interface DeviceInfo {
  deviceId: string;
  platform: string;
  label: string | null;
  appVersion: string;
  lastSeenAt: string;
  current: boolean;
}

function codeFor(status: number, error?: string): AuthErrorCode {
  if (status === 401) return 'session_expired';
  if (error === 'reauth_required') return 'reauth_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

async function api<T>(method: 'GET' | 'POST', path: string, token: string, body?: unknown, fetcher?: typeof fetch): Promise<T> {
  if (!env.accountApiUrl) throw new AuthError('not_configured');
  const res = await request(`${env.accountApiUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, fetcher);
  const json = await bodyOf<T & { error?: string }>(res);
  if (!res.ok) throw new AuthError(codeFor(res.status, json?.error));
  return json as T;
}

export const accountApi = {
  async me(token: string, fetcher?: typeof fetch): Promise<AccountInfo> {
    const m = await api<{ user_id: string; email: string; email_verified: boolean; status: string; plan: string; deletion_scheduled_for: string | null }>('GET', '/v1/me', token, undefined, fetcher);
    return {
      userId: m.user_id,
      email: m.email,
      verified: !!m.email_verified,
      status: m.status === 'pending_deletion' ? 'pending_deletion' : 'active',
      plan: m.plan === 'PLUS' || m.plan === 'BUSINESS' ? m.plan : 'FREE',
      deletionScheduledFor: m.deletion_scheduled_for ?? null,
    };
  },
  registerDevice: (token: string, d: { installationId: string; platform: 'android' | 'ios'; label: string | null; appVersion: string }, fetcher?: typeof fetch) =>
    api<{ device_id: string }>('POST', '/v1/devices/register', token, { installation_id: d.installationId, platform: d.platform, device_label: d.label, app_version: d.appVersion }, fetcher),
  heartbeat: (token: string, appVersion: string, fetcher?: typeof fetch) => api('POST', '/v1/devices/heartbeat', token, { app_version: appVersion }, fetcher),
  async devices(token: string, fetcher?: typeof fetch): Promise<DeviceInfo[]> {
    const r = await api<{ devices: { device_id: string; platform: string; device_label: string | null; app_version: string; last_seen_at: string; current: boolean }[] }>('GET', '/v1/devices', token, undefined, fetcher);
    return (r.devices ?? []).map((d) => ({ deviceId: d.device_id, platform: d.platform, label: d.device_label, appVersion: d.app_version, lastSeenAt: d.last_seen_at, current: !!d.current }));
  },
  revokeDevice: (token: string, id: string, fetcher?: typeof fetch) => api('POST', `/v1/devices/${encodeURIComponent(id)}/revoke`, token, undefined, fetcher),
  logoutCurrent: (token: string, fetcher?: typeof fetch) => api('POST', '/v1/devices/current/logout', token, undefined, fetcher),
  revokeAll: (token: string, fetcher?: typeof fetch) => api('POST', '/v1/devices/revoke-all', token, undefined, fetcher),
  requestDeletion: (token: string, fetcher?: typeof fetch) => api<{ scheduled_for: string }>('POST', '/v1/account/delete', token, undefined, fetcher),
  cancelDeletion: (token: string, fetcher?: typeof fetch) => api('POST', '/v1/account/delete/cancel', token, undefined, fetcher),
};
