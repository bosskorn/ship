/**
 * The last email link that opened the app (`onescan://auth/callback…`), kept in memory only.
 * Expo Router drops the URL fragment when it navigates, and `Linking.getInitialURL()` misses links
 * that arrive while the app is already running, so the native-intent hook drops the full URL here
 * and the callback screen takes it once.
 */
let pending: string | null = null;

export const isAuthLink = (url: string) => /^onescan:\/\/auth\/callback(?:[/?#]|$)/i.test(url);

export function putAuthLink(url: string) {
  pending = url;
}

export function takeAuthLink(): string | null {
  const url = pending;
  pending = null;
  return url;
}
