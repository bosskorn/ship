const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const STORAGE_KEY = 'ship.ops.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: { id: string; role: 'OPS' | 'ADMIN'; displayName: string | null };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let session: Session | null = (() => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
})();
const listeners = new Set<(s: Session | null) => void>();

export function getSession() {
  return session;
}

export function setSession(s: Session | null) {
  session = s;
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(s));
}

export function onSession(fn: (s: Session | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function deviceId() {
  try {
    let id = localStorage.getItem('ship.ops.device');
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem('ship.ops.device', id);
    }
    return id;
  } catch {
    return `web-${crypto.randomUUID()}`;
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  if (!session) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session!.refreshToken, deviceId: session!.deviceId }),
      });
      if (!res.ok) {
        setSession(null);
        return false;
      }
      const pair = await res.json();
      setSession({ ...session!, accessToken: pair.accessToken, refreshToken: pair.refreshToken });
      return true;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = any>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && session && (await refresh())) return api<T>(method, path, body, false);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.code ?? 'ERROR', json?.message ?? res.statusText, json?.details);
  return json as T;
}

export const get = <T = any>(path: string) => api<T>('GET', path);
export const post = <T = any>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T = any>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});

export async function login(email: string, password: string, totp?: string) {
  const pair = await api<any>('POST', '/auth/staff/login', { email, password, totp: totp || undefined, deviceId: deviceId() }, false);
  setSession({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, deviceId: deviceId(), user: pair.user });
}

export async function logout() {
  await api('POST', '/auth/logout').catch(() => undefined);
  setSession(null);
}

export { API_URL };
