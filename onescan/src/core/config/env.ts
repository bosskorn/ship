import Constants from 'expo-constants';

/**
 * Build-time configuration. Only the API base URL is configured here;
 * plans, prices, credit costs and feature flags come from the backend.
 */
export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  /** The installed build's version (app.json `version`, embedded at build time). */
  appVersion: Constants.expoConfig?.version ?? '',
} as const;
