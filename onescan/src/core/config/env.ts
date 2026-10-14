import Constants from 'expo-constants';

/**
 * Build-time configuration. Only the API base URL is configured here;
 * plans, prices, credit costs and feature flags come from the backend.
 */
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
  /** The installed build's version (app.json `version`, embedded at build time). */
  appVersion: Constants.expoConfig?.version ?? '',
} as const;
