/**
 * Build-time configuration. Only the API base URL is configured here;
 * plans, prices, credit costs and feature flags come from the backend.
 */
export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  appVersion: '1.0.0',
} as const;
