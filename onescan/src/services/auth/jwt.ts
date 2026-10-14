/** Reads (does not verify) the claims the app needs from a Supabase access token. */
export interface TokenClaims {
  sub: string;
  sessionId: string;
  exp: number;
  email: string | null;
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = globalThis.atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function readClaims(token: string): TokenClaims | null {
  try {
    const p = JSON.parse(b64urlDecode(token.split('.')[1] ?? '')) as Record<string, unknown>;
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number') return null;
    return { sub: p.sub, sessionId: typeof p.session_id === 'string' ? p.session_id : '', exp: p.exp, email: typeof p.email === 'string' ? p.email : null };
  } catch {
    return null;
  }
}
