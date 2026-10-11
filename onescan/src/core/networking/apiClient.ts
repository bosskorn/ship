import { env } from '../config/env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Thin client for the OneScan backend (Cloudflare Workers).
 * Document content is never sent through this client except by AIEngine
 * after explicit consent, and by SyncEngine as encrypted blobs only.
 */
export const apiClient = {
  isConfigured: () => env.apiBaseUrl.length > 0,

  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>('GET', path, undefined, init);
  },

  async post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return request<T>('POST', path, body, init);
  },
};

async function request<T>(method: string, path: string, body: unknown, init?: RequestInit): Promise<T> {
  if (!apiClient.isConfigured()) throw new ApiError(0, 'API base URL is not configured');
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    method,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${method} ${path} failed`);
  return (await res.json()) as T;
}
