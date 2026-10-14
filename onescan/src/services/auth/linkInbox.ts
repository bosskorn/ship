/**
 * The last email link that opened the app (`onescan://auth/callback…` or the App Link), kept in memory only.
 * Expo Router drops the URL fragment when it navigates, and `Linking.getInitialURL()` misses links
 * that arrive while the app is already running, so the native-intent hook drops the full URL here
 * and the callback screen takes it once.
 */
let pending: string | null = null;

/** Production App Link host (same value as env.appLinkHost; read here so this file stays import-free). */
const host = (process.env.EXPO_PUBLIC_APP_LINK_HOST ?? '').trim().toLowerCase();

export const productionAppLinks = () => !!host;
export const isCustomSchemeAuthLink = (url: string) => /^onescan:\/\/auth\//i.test(url);

/** `onescan://auth/callback…` (QA) or the verified App Link `https://<host>/auth/link…` (production). */
export function isAuthLink(url: string, appLinkHost: string = host): boolean {
  if (!appLinkHost) return /^onescan:\/\/auth\/callback(?:[/?#]|$)/i.test(url);
  const esc = appLinkHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https://${esc}/auth/link/?(?:[?#]|$)`, 'i').test(url);
}

export function putAuthLink(url: string) {
  pending = url;
}

export function takeAuthLink(): string | null {
  const url = pending;
  pending = null;
  return url;
}
