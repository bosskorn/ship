import { AuthError } from './errors';

/** Network timeout for every account call: the account must never hold up the app. */
export const ACCOUNT_TIMEOUT_MS = 10_000;

/** fetch with a timeout; transport failures become AuthError('network'). */
export async function request(url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ACCOUNT_TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: ctrl.signal });
  } catch {
    throw new AuthError('network');
  } finally {
    clearTimeout(t);
  }
}

export async function bodyOf<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
