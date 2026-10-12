import { create } from 'zustand';
import type { ImageInfo } from '@/native/OneScanVision';

/**
 * Scan quality diagnostics (v1.0.5): pixel size / file size of each image tier for the
 * most recent pages. Numbers only — no image content, file names or text — and kept in
 * memory for the Scan diagnostics screen; never persisted or sent anywhere.
 */
export type DiagnosticStage = 'source' | 'preview' | 'master' | 'thumbnail' | 'pdf';

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
  /** OneScan camera only: HD/MAX tier and JPEG quality the still was captured at. */
  capture?: { tier?: string; jpegQuality?: number };
  /** Milliseconds: shutter → file (capture), file → enhanced preview (process). */
  timings?: { captureMs?: number; processMs?: number };
}

interface DiagnosticsState {
  pages: PageDiagnostics[];
  record: (page: Omit<PageDiagnostics, 'at'>) => void;
  /** Add a stage to the most recent entry for `page` (e.g. the document thumbnail). */
  attach: (page: number, stage: DiagnosticStage, info: StageInfo | undefined) => void;
  clear: () => void;
}

const MAX_PAGES = 20;

export const useScanDiagnostics = create<DiagnosticsState>((set) => ({
  pages: [],
  record: (page) => set((s) => ({ pages: [{ ...page, at: Date.now() }, ...s.pages].slice(0, MAX_PAGES) })),
  attach: (page, stage, info) =>
    set((s) => {
      if (!info) return s;
      const i = s.pages.findIndex((p) => p.page === page);
      if (i < 0) return s;
      const pages = [...s.pages];
      pages[i] = { ...pages[i], stages: { ...pages[i].stages, [stage]: info } };
      return { pages };
    }),
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
