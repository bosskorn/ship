import Constants from 'expo-constants';

/**
 * Build-time configuration. Only the API base URL is configured here;
 * plans, prices, credit costs and feature flags come from the backend.
 */
/** A bare lowercase host name, or '' (anything else is ignored rather than trusted). */
function appLinkHost(v: string | undefined): string {
  const h = (v ?? '').trim().toLowerCase();
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h) ? h : '';
}

export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  /**
   * OneScan Account (1.3). All three set = the account feature can work; any missing = the app
   * behaves as 1.2 (no account UI). The anon key is public by design; the service key never
   * ships in the app.
   */
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  accountApiUrl: process.env.EXPO_PUBLIC_ACCOUNT_API_URL ?? '',
  /**
   * Verified Android App Links host (e.g. `onescan.app`). Set for production: verification and
   * reset emails then link to `https://<host>/auth/link`, which Android opens in OneScan only.
   * Empty (QA builds) = the OneScan API's own `/auth/link`.
   */
  appLinkHost: appLinkHost(process.env.EXPO_PUBLIC_APP_LINK_HOST),
  /** The installed build's version (app.json `version`, embedded at build time). */
  appVersion: Constants.expoConfig?.version ?? '',
} as const;
