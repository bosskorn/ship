import { Platform } from 'react-native';
import { createJSONStorage, StateStorage } from 'zustand/middleware';

/**
 * Local key-value persistence (SQLite-backed on device). Never synced.
 * Secrets (PIN hash, encryption keys) belong in SecureStore, not here.
 */
interface KV {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
}

function createKv(): KV {
  if (Platform.OS === 'web') {
    // Web is a development preview target only.
    return {
      getItem: async (k) => globalThis.localStorage?.getItem(k) ?? null,
      setItem: async (k, v) => globalThis.localStorage?.setItem(k, v),
      removeItem: async (k) => globalThis.localStorage?.removeItem(k),
    };
  }
  // Lazy require keeps the SQLite KV store out of the web bundle path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Storage = require('expo-sqlite/kv-store').default as {
    getItem(k: string): Promise<string | null>;
    setItem(k: string, v: string): Promise<void>;
    removeItem(k: string): Promise<boolean>;
  };
  return {
    getItem: (k) => Storage.getItem(k),
    setItem: (k, v) => Storage.setItem(k, v),
    removeItem: async (k) => {
      await Storage.removeItem(k);
    },
  };
}

export const kvStore: KV = createKv();

const stateStorage: StateStorage = {
  getItem: (n) => kvStore.getItem(n),
  setItem: (n, v) => kvStore.setItem(n, v),
  removeItem: (n) => kvStore.removeItem(n),
};

export const persistentJSONStorage = createJSONStorage(() => stateStorage);
