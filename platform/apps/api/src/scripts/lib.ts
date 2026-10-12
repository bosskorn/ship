/** Small HTTP/socket client used by the demo, scenario and simulator scripts. */
import { haversineMeters, LatLng } from '@ship/shared';
import { io, Socket } from 'socket.io-client';

export const API = process.env.API_URL ?? 'http://localhost:4000';
export const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@ship.local';
export const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'ChangeMe!2026';

export const rnd = () => Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

export async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.code ?? 'ERROR', `${method} ${path} -> ${res.status} ${text}`);
  return json as T;
}

export async function expectError(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError && e.code === code) return e;
    throw new Error(`expected ${code}, got ${(e as Error).message}`);
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

export async function otpLogin(phone: string, role: 'CUSTOMER' | 'DRIVER', deviceId = `dev-${role}-${rnd()}`) {
  const req = await call('POST', '/auth/otp/request', undefined, { phone, role });
  assert(req.devCode, 'API must run with OTP_DEV_ECHO=true');
  const pair = await call('POST', '/auth/otp/verify', undefined, { phone, role, code: req.devCode, deviceId });
  return { ...pair, deviceId };
}

export async function staffLogin() {
  return call('POST', '/auth/staff/login', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: `ops-${rnd()}` });
}

export function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(API, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

export function waitFor<T>(socket: Socket, event: string, pred: (p: T) => boolean = () => true, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, h);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const h = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(t);
      socket.off(event, h);
      resolve(p);
    };
    socket.on(event, h);
  });
}

export async function uploadTinyJpeg(token: string, purpose: string): Promise<string> {
  const signed = await call('POST', '/uploads/sign', token, { purpose, contentType: 'image/jpeg' });
  const bytes = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2Q==', 'base64');
  const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: bytes });
  assert(res.ok, `upload failed ${res.status}`);
  return signed.key;
}

/** Register + KYC + approve a driver. Returns tokens and the user id. */
export async function onboardDriver(
  adminToken: string,
  opts: { vehicle?: 'MOTORCYCLE' | 'CAR' | 'PICKUP' | 'VAN'; tier?: string; firstName?: string } = {},
) {
  const d = await otpLogin(`08${rnd()}`, 'DRIVER');
  const T = d.accessToken;
  await call('PUT', '/driver/profile', T, {
    firstName: opts.firstName ?? 'ทดสอบ',
    lastName: `คนขับ${rnd().slice(0, 3)}`,
    nationalId: `1${rnd()}${rnd().slice(0, 4)}`,
    licenseNumber: `DL${rnd()}`,
    licenseExpiry: '2030-12-31',
  });
  await call('POST', '/driver/vehicles', T, {
    type: opts.vehicle ?? 'MOTORCYCLE',
    plateNumber: `${rnd().slice(0, 1)}กข ${rnd().slice(0, 4)}`,
    plateProvince: 'กรุงเทพมหานคร',
  });
  for (const kind of ['SELFIE', 'NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION']) {
    await call('POST', '/driver/documents', T, { kind, fileKey: await uploadTinyJpeg(T, 'KYC') });
  }
  await call('POST', '/driver/kyc/submit', T);
  await call('POST', `/ops/drivers/${d.user.id}/kyc`, adminToken, { decision: 'APPROVED', note: 'auto-approved (test)' });
  if (opts.tier) await call('POST', `/ops/drivers/${d.user.id}/tier`, adminToken, { tier: opts.tier, reason: 'test setup' });
  return { id: d.user.id as string, token: T, refreshToken: d.refreshToken as string, deviceId: d.deviceId };
}

/** Move a driver in ≤300 m steps (keeps the impossible-travel detector quiet). */
export async function drive(token: string, from: LatLng, to: LatLng, delayMs = 30) {
  const steps = Math.max(2, Math.ceil(haversineMeters(from, to) / 300));
  for (let i = 1; i <= steps; i++) {
    const p = { lat: from.lat + ((to.lat - from.lat) * i) / steps, lng: from.lng + ((to.lng - from.lng) * i) / steps };
    await call('POST', '/driver/location', token, { pings: [{ ...p, ts: Date.now(), speed: 8, accuracy: 8 }] });
    if (delayMs) await sleep(delayMs);
  }
}

export function stop(location: LatLng, address: string, contactName = 'ติดต่อ') {
  return { location, address, contactName, contactPhone: '0812345678' };
}
