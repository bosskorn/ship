import { create } from 'zustand';
import type { ImageInfo } from '@/native/OneScanVision';

/**
 * Scan quality diagnostics (v1.0.5): pixel size / file size of each image tier for the
 * most recent pages. Numbers only — no image content, file names or text — and kept in
 * memory for the Scan diagnostics screen; never persisted or sent anywhere.
 */
export type DiagnosticStage = 'source' | 'preview' | 'master' | 'pdf';

export interface StageInfo {
  width: number;
  height: number;
  bytes: number;
  mimeType?: string;
  /** JPEG quality of the single encode, when this stage was encoded by OneScan. */
  quality?: number;
  degraded?: boolean;
}

export interface PageDiagnostics {
  page: number;
  at: number;
  /** Where a freshly captured page came from (absent for pages rendered on save). */
  scanner?: 'system' | 'camera';
  filter: string;
  profile: string;
  stages: Partial<Record<DiagnosticStage, StageInfo>>;
}

interface DiagnosticsState {
  pages: PageDiagnostics[];
  record: (page: Omit<PageDiagnostics, 'at'>) => void;
  clear: () => void;
}

const MAX_PAGES = 20;

export const useScanDiagnostics = create<DiagnosticsState>((set) => ({
  pages: [],
  record: (page) => set((s) => ({ pages: [{ ...page, at: Date.now() }, ...s.pages].slice(0, MAX_PAGES) })),
  clear: () => set({ pages: [] }),
}));

export function toStage(info: ImageInfo | null, extra?: { quality?: number; degraded?: boolean }): StageInfo | undefined {
  if (!info) return undefined;
  return { width: info.width, height: info.height, bytes: info.bytes, mimeType: info.mimeType, ...extra };
}

export const megapixels = (s: { width: number; height: number }) => (s.width * s.height) / 1e6;

/** Share of the source's pixels the master kept (1 = all). */
export function pixelRetention(source: { width: number; height: number }, master: { width: number; height: number }): number {
  return (master.width * master.height) / Math.max(1, source.width * source.height);
}
