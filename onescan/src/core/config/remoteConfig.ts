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
  | 'restore_enabled';

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

export function isFeatureEnabled(flag: FeatureFlag, config: RemoteConfig = useRemoteConfig.getState().config) {
  return config.flags[flag] === true;
}

export function useFeature(flag: FeatureFlag) {
  return useRemoteConfig((s) => s.config.flags[flag] === true);
}
