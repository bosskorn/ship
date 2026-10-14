/**
 * Account errors the UI can show. Provider/API errors are mapped to these codes and never shown
 * raw (no Supabase messages, status codes or stack text on screen).
 */
export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_exists'
  | 'weak_password'
  | 'same_password'
  | 'expired_link'
  | 'session_expired'
  | 'reauth_required'
  | 'rate_limited'
  | 'network'
  | 'server'
  | 'not_configured'
  | 'unknown';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

export const isAuthError = (e: unknown, code?: AuthErrorCode): e is AuthError =>
  e instanceof AuthError && (code === undefined || e.code === code);

/** Supabase Auth (GoTrue) error → OneScan code. */
export function mapAuthError(status: number, body: { error_code?: string; error?: string; error_description?: string; msg?: string } | null, op: 'verify' | 'refresh' | 'other' = 'other'): AuthErrorCode {
  const code = body?.error_code ?? body?.error ?? '';
  if (status === 429 || /rate_limit/.test(code)) return 'rate_limited';
  if (status >= 500) return 'server';
  switch (code) {
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'email_not_confirmed':
      return 'email_not_confirmed';
    case 'user_already_exists':
    case 'email_exists':
      return 'email_exists';
    case 'weak_password':
      return 'weak_password';
    case 'same_password':
      return 'same_password';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid_email';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return 'expired_link';
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'session_not_found':
    case 'session_expired':
    case 'user_not_found':
    case 'bad_jwt':
      return op === 'verify' ? 'expired_link' : 'session_expired';
    case 'invalid_grant':
      // Older servers: wrong password on sign-in, dead token on refresh.
      return op === 'refresh' ? 'session_expired' : 'invalid_credentials';
  }
  if (op === 'verify' && (status === 400 || status === 403 || status === 404)) return 'expired_link';
  if (op === 'refresh' && (status === 400 || status === 401 || status === 403)) return 'session_expired';
  return 'unknown';
}
