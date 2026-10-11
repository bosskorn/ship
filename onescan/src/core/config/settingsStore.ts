import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistentJSONStorage } from '../storage/kvStorage';
import type { LanguageCode } from '../i18n/languages';

export type AppearancePreference = 'system' | 'light' | 'dark';
export type AutoLockDelay = 'immediately' | '1m' | '5m';

/**
 * Privacy settings. Defaults are product invariants (spec §29, §66):
 * on-device processing is always on, AI and auto upload are off.
 */
export interface PrivacySettings {
  /** Not user-toggleable: basic processing never leaves the device. */
  readonly processOnDevice: true;
  allowAI: boolean;
  autoCloudUpload: boolean;
  usageAnalytics: boolean;
  crashReports: boolean;
}

export interface SecuritySettings {
  appLock: boolean;
  biometric: boolean;
  autoLock: AutoLockDelay;
  screenshotProtection: boolean;
}

export interface ScannerSettings {
  autoCapture: boolean;
  multiPage: boolean;
  showGrid: boolean;
}

export const defaultPrivacy: PrivacySettings = {
  processOnDevice: true,
  allowAI: false,
  autoCloudUpload: false,
  usageAnalytics: false,
  crashReports: false,
};

interface SettingsState {
  hydrated: boolean;
  onboardingCompleted: boolean;
  /** `null` = follow system language. */
  language: LanguageCode | null;
  appearance: AppearancePreference;
  privacy: PrivacySettings;
  security: SecuritySettings;
  scanner: ScannerSettings;
  completeOnboarding: () => void;
  setLanguage: (l: LanguageCode | null) => void;
  setAppearance: (a: AppearancePreference) => void;
  setPrivacy: (patch: Partial<Omit<PrivacySettings, 'processOnDevice'>>) => void;
  setSecurity: (patch: Partial<SecuritySettings>) => void;
  setScanner: (patch: Partial<ScannerSettings>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboardingCompleted: false,
      language: null,
      appearance: 'system',
      privacy: defaultPrivacy,
      security: { appLock: false, biometric: false, autoLock: 'immediately', screenshotProtection: false },
      scanner: { autoCapture: true, multiPage: true, showGrid: false },
      completeOnboarding: () => set({ onboardingCompleted: true }),
      setLanguage: (language) => set({ language }),
      setAppearance: (appearance) => set({ appearance }),
      setPrivacy: (patch) =>
        set((s) => ({
          privacy: {
            ...s.privacy,
            ...patch,
            processOnDevice: true,
            // Auto upload is meaningless without explicit cloud opt-in; guarded again in SyncEngine.
          },
        })),
      setSecurity: (patch) => set((s) => ({ security: { ...s.security, ...patch } })),
      setScanner: (patch) => set((s) => ({ scanner: { ...s.scanner, ...patch } })),
    }),
    {
      name: 'onescan.settings.v1',
      version: 1,
      storage: persistentJSONStorage,
      partialize: ({ hydrated: _h, ...rest }) => rest,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          privacy: { ...defaultPrivacy, ...p.privacy, processOnDevice: true },
          security: { ...current.security, ...p.security },
          scanner: { ...current.scanner, ...p.scanner },
        };
      },
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
