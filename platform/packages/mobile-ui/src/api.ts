import * as SecureStore from 'expo-secure-store';
import { io, Socket } from 'socket.io-client';

/**
 * API client shared by both apps. Tokens live in the OS keychain/keystore (expo-secure-store),
 * never in AsyncStorage. No secrets are bundled: the app only knows the public API URL.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: { id: string; role: 'CUSTOMER' | 'DRIVER'; phone: string | null; displayName: string | null };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

type Listener = (s: Session | null) => void;

export function createApiClient(opts: { baseUrl: string; storageKey: string }) {
  let session: Session | null = null;
  const listeners = new Set<Listener>();
  let refreshing: Promise<boolean> | null = null;
  let socket: Socket | null = null;

  async function persist(s: Session | null) {
    session = s;
    // AFTER_FIRST_UNLOCK so the driver's background location task can read the token.
    if (s) await SecureStore.setItemAsync(opts.storageKey, JSON.stringify(s), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    else await SecureStore.deleteItemAsync(opts.storageKey);
    listeners.forEach((l) => l(s));
    if (!s && socket) {
      socket.disconnect();
      socket = null;
    }
  }

  async function restore(): Promise<Session | null> {
    const raw = await SecureStore.getItemAsync(opts.storageKey);
    session = raw ? (JSON.parse(raw) as Session) : null;
    return session;
  }

  async function deviceId(): Promise<string> {
    const key = `${opts.storageKey}.device`;
    let id = await SecureStore.getItemAsync(key);
    if (!id) {
      id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await SecureStore.setItemAsync(key, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    }
    return id;
  }

  async function refresh(): Promise<boolean> {
    if (!session) return false;
    refreshing ??= (async () => {
      try {
        const res = await fetch(`${opts.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: session!.refreshToken, deviceId: session!.deviceId }),
        });
        if (!res.ok) {
          await persist(null);
          return false;
        }
        const pair = await res.json();
        await persist({ ...session!, accessToken: pair.accessToken, refreshToken: pair.refreshToken });
        return true;
      } catch {
        return false; // offline: keep the session, try again later
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
    return refreshing;
  }

  async function request<T = any>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${opts.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาตรวจสอบอินเทอร์เน็ต');
    }
    if (res.status === 401 && retry && session && (await refresh())) return request<T>(method, path, body, false);
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json?.code ?? 'ERROR', json?.message ?? 'เกิดข้อผิดพลาด', json?.details);
    return json as T;
  }

  async function requestOtp(phone: string, role: 'CUSTOMER' | 'DRIVER') {
    return request<{ expiresIn: number; devCode?: string }>('POST', '/auth/otp/request', { phone, role }, false);
  }

  async function verifyOtp(phone: string, role: 'CUSTOMER' | 'DRIVER', code: string, extra: { pushToken?: string; deviceName?: string } = {}) {
    const id = await deviceId();
    const pair = await request('POST', '/auth/otp/verify', { phone, role, code, deviceId: id, ...extra }, false);
    await persist({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, deviceId: id, user: pair.user });
    return pair;
  }

  async function logout() {
    await request('POST', '/auth/logout').catch(() => undefined);
    await persist(null);
  }

  /** Authenticated Socket.IO connection (reconnects with the latest access token). */
  function realtime(): Socket {
    if (socket) return socket;
    socket = io(opts.baseUrl, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: session?.accessToken }),
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect_error', () => void refresh());
    return socket;
  }

  /** PUT a local file (camera/gallery URI) to a signed upload URL; returns the storage key. */
  async function uploadFile(localUri: string, purpose: 'KYC' | 'PARCEL' | 'POD' | 'SIGNATURE', contentType = 'image/jpeg'): Promise<string> {
    const signed = await request('POST', '/uploads/sign', { purpose, contentType });
    const blob = await (await fetch(localUri)).blob();
    const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: blob });
    if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', 'อัปโหลดไฟล์ไม่สำเร็จ');
    return signed.key as string;
  }

  /** Upload in-memory content (e.g. a signature SVG) to a signed URL. */
  async function uploadContent(body: string, purpose: 'SIGNATURE' | 'POD', contentType: string): Promise<string> {
    const signed = await request('POST', '/uploads/sign', { purpose, contentType });
    const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body });
    if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', 'อัปโหลดไม่สำเร็จ');
    return signed.key as string;
  }

  return {
    baseUrl: opts.baseUrl,
    get session() {
      return session;
    },
    restore,
    onSession(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: <T = any>(p: string) => request<T>('GET', p),
    post: <T = any>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
    put: <T = any>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
    patch: <T = any>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
    del: <T = any>(p: string) => request<T>('DELETE', p),
    requestOtp,
    verifyOtp,
    logout,
    realtime,
    uploadFile,
    uploadContent,
    refresh,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
