import type { Env } from './env';

export class DbError extends Error {
  constructor(readonly status: number, readonly pgCode?: string) {
    super(`db ${status}${pgCode ? ` ${pgCode}` : ''}`);
  }
}

/**
 * Calls a function in schema `app` through Supabase's REST API with the service-role key.
 * Business rules live in those SQL functions (ownership checks included); this is transport.
 */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<T> {
  if (env.DB_CALL) return (await env.DB_CALL(fn, args)) as T;
  const res = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'content-profile': 'app',
      'accept-profile': 'app',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      code = ((await res.json()) as { code?: string }).code;
    } catch {
      // not JSON
    }
    throw new DbError(res.status, code);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
