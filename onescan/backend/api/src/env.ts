/** Worker bindings and secrets (wrangler.toml + `wrangler secret put`). */
export interface Env {
  /** https://<project>.supabase.co */
  SUPABASE_URL: string;
  /** Service-role key: server side only, never shipped in the app. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Legacy HS256 projects only; asymmetric (JWKS) signing keys are preferred. */
  SUPABASE_JWT_SECRET?: string;
  /** Android package + SHA-256 signing-cert fingerprints for App Links (comma separated). */
  ANDROID_PACKAGE?: string;
  ANDROID_CERT_SHA256?: string;
  /** Rate limiting (Workers Rate Limiting API); optional in local tests. */
  RL_API?: RateLimit;
  RL_SENSITIVE?: RateLimit;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
