import { create } from 'zustand';
import { defaultScanQuality, ScanQuality } from '@/core/document-engine/image/quality';
import { persist } from 'zustand/middleware';
import { persistentJSONStorage } from '../storage/kvStorage';
import type { LanguageCode } from '../i18n/languages';
import { defaultOcrLanguage, type OcrLanguageId } from '../document-engine/ocr/ocrLanguages';

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

/** Which camera runs a scan. `auto` = OneScan, falling back to the system scanner when it can't. */
export type ScannerEngineSetting = 'auto' | 'onescan' | 'google';

export interface ScannerSettings {
  /** User's auto-capture switch; only honoured while the `auto_capture_enabled` flag is on. */
  autoCapture: boolean;
  /** Legacy (≤1.0.6). Multi-page is now a per-scan capture state. */
  multiPage: boolean;
  showGrid: boolean;
  /** Master resolution / JPEG quality tier (see document-engine/image/quality.ts). */
  quality: ScanQuality;
  engine: ScannerEngineSetting;
  /** Card-mode "processed on device" note was shown and dismissed. */
  cardPrivacySeen: boolean;
}

/**
 * OneScan camera health, for engine fallback. `opening` is set before the camera binds
 * and cleared once it is ready (or the scanner closes); still set on the next open means
 * the last open crashed or hung.
 */
/**
 * Automatic-crop outcomes on this device (counts only), for the Manual Correction Rate:
 * how often a crop the app applied or suggested was then changed by hand.
 */
export interface CropStats {
  auto: number;
  review: number;
  manual: number;
  /** Auto-applied crops the user then adjusted. */
  autoCorrected: number;
  /** Suggested crops the user accepted as they were / adjusted. */
  reviewAccepted: number;
  reviewCorrected: number;
}

export const emptyCropStats: CropStats = { auto: 0, review: 0, manual: 0, autoCorrected: 0, reviewAccepted: 0, reviewCorrected: 0 };

export interface ScannerHealth {
  /** The OneScan camera is starting (set until its first frame / ready event). */
  opening: boolean;
  /** Camera start failures (crash or error while starting), reset once the camera works. */
  failures: number;
  /** When the last failure happened (ms); failures older than a week no longer count. */
  lastFailureAt?: number;
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
  /** The one-time permissions screen (after onboarding, or on first launch after updating) was shown. */
  permissionsIntroSeen: boolean;
  /** Name for new scans: `<prefix>_YYYY-MM-DD_HH-mm`. Empty = "OneScan". */
  fileNamePrefix: string;
  setFileNamePrefix(prefix: string): void;
  /** `null` = follow system language. */
  language: LanguageCode | null;
  /** OCR language (document text), independent of the app language. See ocrLanguages.ts. */
  ocrLanguage: OcrLanguageId;
  /** Documents screen layout. */
  documentsView: 'list' | 'grid';
  setDocumentsView: (v: 'list' | 'grid') => void;
  appearance: AppearancePreference;
  privacy: PrivacySettings;
  security: SecuritySettings;
  scanner: ScannerSettings;
  scannerHealth: ScannerHealth;
  /** Developer mode (About: tap the version 7 times): shows Scan Diagnostics. */
  devMode: boolean;
  setDevMode: (on: boolean) => void;
  cropStats: CropStats;
  countCrop: (key: keyof CropStats) => void;
  resetCropStats: () => void;
  setScannerHealth: (patch: Partial<ScannerHealth>) => void;
  completeOnboarding: () => void;
  completePermissionsIntro: () => void;
  setLanguage: (l: LanguageCode | null) => void;
  setOcrLanguage: (id: OcrLanguageId) => void;
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
      permissionsIntroSeen: false,
      fileNamePrefix: '',
      setFileNamePrefix: (fileNamePrefix) => set({ fileNamePrefix }),
      language: null,
      ocrLanguage: defaultOcrLanguage,
      documentsView: 'list',
      setDocumentsView: (documentsView) => set({ documentsView }),
      appearance: 'system',
      privacy: defaultPrivacy,
      security: { appLock: false, biometric: false, autoLock: 'immediately', screenshotProtection: false },
      scanner: { autoCapture: false, multiPage: false, showGrid: false, quality: defaultScanQuality, engine: 'auto', cardPrivacySeen: false },
      scannerHealth: { opening: false, failures: 0 },
      devMode: false,
      setDevMode: (devMode) => set({ devMode }),
      cropStats: emptyCropStats,
      countCrop: (key) => set((s) => ({ cropStats: { ...s.cropStats, [key]: s.cropStats[key] + 1 } })),
      resetCropStats: () => set({ cropStats: emptyCropStats }),
      setScannerHealth: (patch) => set((s) => ({ scannerHealth: { ...s.scannerHealth, ...patch } })),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      completePermissionsIntro: () => set({ permissionsIntroSeen: true }),
      setLanguage: (language) => set({ language }),
      setOcrLanguage: (ocrLanguage) => set({ ocrLanguage }),
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
      version: 2,
      storage: persistentJSONStorage,
      // v2 (1.3): Documents opens as a list (names first) for everyone, once.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return (version < 2 ? { ...p, documentsView: 'list' } : p) as SettingsState;
      },
      partialize: ({ hydrated: _h, ...rest }) => rest,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          privacy: { ...defaultPrivacy, ...p.privacy, processOnDevice: true },
          security: { ...current.security, ...p.security },
          scanner: { ...current.scanner, ...p.scanner },
          scannerHealth: { ...current.scannerHealth, ...p.scannerHealth },
          cropStats: { ...emptyCropStats, ...p.cropStats },
        };
      },
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
