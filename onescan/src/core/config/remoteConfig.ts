import { create } from 'zustand';
import { kvStore } from '../storage/kvStorage';
import { apiClient } from '../networking/apiClient';

/** Feature gates. Release phase (spec §60) is controlled remotely, not by app updates. */
export type FeatureFlag =
  | 'ocr'
  | 'sensitiveDetection'
  | 'redaction'
  | 'appLock'
  | 'ai'
  | 'aiCredits'
  | 'cloudBackup'
  | 'externalCloud'
  | 'pro'
  | 'advancedPdf'
  | 'convert'
  // Scanner (Phase 1). Remote-config ready; defaults below.
  | 'custom_scanner_enabled'
  | 'auto_capture_enabled'
  | 'quality_coach_enabled'
  | 'glare_detection_enabled'
  | 'shadow_detection_enabled'
  | 'restore_enabled'
  // Production audit (1.2.0): UI that exists but is not shipped yet.
  | 'trash'
  | 'devTools'
  | 'telemetrySettings';

export type AiTask =
  | 'ocr_advanced'
  | 'extract_receipt'
  | 'extract_invoice'
  | 'summary'
  | 'translate'
  | 'ask'
  | 'contract_analysis';

export interface PlanPrice {
  period: 'month' | 'year';
  /** Minor units (satang/cents) to avoid float errors. */
  amountMinor: number;
  currency: string;
  storeProductId: string;
}

export interface Plan {
  id: string;
  tier: 'free' | 'pro' | 'ai_pro';
  name: Record<string, string>;
  features: string[];
  prices: PlanPrice[];
  monthlyAiCredits: number;
}

export interface RemoteConfig {
  version: number;
  plans: Plan[];
  creditCosts: Partial<Record<AiTask, number>>;
  flags: Partial<Record<FeatureFlag, boolean>>;
  trashRetentionDays: number;
}

/**
 * Offline fallback: V1.0 local features only, and NO plans/prices.
 * Anything monetized must come from the backend.
 */
export const fallbackConfig: RemoteConfig = {
  version: 0,
  plans: [],
  creditCosts: {},
  // Local-only features that are built and need no backend.
  flags: {
    ocr: true,
    sensitiveDetection: true,
    redaction: true,
    custom_scanner_enabled: true,
    // Manual capture is primary; auto capture ships only after Phase 2 device QA.
    auto_capture_enabled: __DEV__,
    quality_coach_enabled: true,
    // No glare/shadow detector or restore engine yet: the UI paths exist, switched off.
    glare_detection_enabled: false,
    shadow_detection_enabled: false,
    restore_enabled: false,
    // Dev builds only (production gate below): developer tools.
    devTools: __DEV__,
  },
  trashRetentionDays: 30,
};

const CACHE_KEY = 'onescan.remoteConfig.v1';

interface RemoteConfigState {
  config: RemoteConfig;
  source: 'fallback' | 'cache' | 'network';
  load: () => Promise<void>;
}

export const useRemoteConfig = create<RemoteConfigState>((set) => ({
  config: fallbackConfig,
  source: 'fallback',
  load: async () => {
    try {
      const cached = await kvStore.getItem(CACHE_KEY);
      if (cached) set({ config: { ...fallbackConfig, ...JSON.parse(cached) }, source: 'cache' });
    } catch {
      // Corrupt cache: ignore and keep fallback.
    }
    if (!apiClient.isConfigured()) return;
    try {
      const fresh = await apiClient.get<RemoteConfig>('/v1/config');
      set({ config: { ...fallbackConfig, ...fresh }, source: 'network' });
      await kvStore.setItem(CACHE_KEY, JSON.stringify(fresh));
    } catch {
      // Offline-first: the app keeps working on cached/fallback config.
    }
  },
}));

/**
 * Production gate (OneScan 1.2.0 feature audit): features that exist in the code but are not
 * ready — need a backend, are UI-only, untested on devices, or are developer tools — are off
 * in release builds whatever the remote/cached config says. To ship one in a later version,
 * remove it from this list (and test it). Development builds (`__DEV__`) follow the config.
 */
export const PRODUCTION_OFF: ReadonlySet<FeatureFlag> = new Set<FeatureFlag>([
  'ai', // no AI backend; consent screen discards results
  'aiCredits',
  'cloudBackup', // no cloud
  'externalCloud',
  'pro', // no plans / payments
  'advancedPdf', // merge/split/compress/protect/sign: not built
  'convert', // PDF → image/Word/Excel: not built
  'appLock', // lock is never enforced; PIN screen is a placeholder
  'redaction', // masking not verified on devices: a missed field would leak when shared
  'auto_capture_enabled', // pending device QA
  'glare_detection_enabled',
  'shadow_detection_enabled',
  'restore_enabled',
  'trash', // no Trash screen / restore yet: deleting is permanent
  'devTools', // developer mode, scan diagnostics
  'telemetrySettings', // analytics / crash-report switches: nothing is collected in 1.2.0
]);

export function flagOn(flags: RemoteConfig['flags'], flag: FeatureFlag): boolean {
  if (!__DEV__ && PRODUCTION_OFF.has(flag)) return false;
  return flags[flag] === true;
}

export function isFeatureEnabled(flag: FeatureFlag, config: RemoteConfig = useRemoteConfig.getState().config) {
  return flagOn(config.flags, flag);
}

export function useFeature(flag: FeatureFlag) {
  return useRemoteConfig((s) => flagOn(s.config.flags, flag));
}
