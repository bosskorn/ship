import * as SecureStore from 'expo-secure-store';

/**
 * Refresh token + session timestamps in platform secure storage (Android Keystore-backed).
 * The access token is never stored; it lives in memory only. Separate from the document
 * encryption keys, which this module never touches.
 */
export interface StoredSession {
  refreshToken: string;
  /** First sign-in of this session (absolute 90-day limit). */
  startedAt: number;
  /** Last successful refresh or sign-in (30-day inactivity limit). */
  lastRefreshAt: number;
}

const KEY = 'onescan.account.session.v1';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const sessionStore = {
  async load(): Promise<StoredSession | null> {
    try {
      const raw = await SecureStore.getItemAsync(KEY, OPTS);
      if (!raw) return null;
      const s = JSON.parse(raw) as StoredSession;
      return typeof s.refreshToken === 'string' && typeof s.startedAt === 'number' && typeof s.lastRefreshAt === 'number' ? s : null;
    } catch {
      return null;
    }
  },
  async save(s: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s), OPTS);
  },
  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY, OPTS);
    } catch {
      // already gone
    }
  },
};
