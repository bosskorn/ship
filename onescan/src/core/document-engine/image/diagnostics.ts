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
  /** Unique per entry (links a captured page to its diagnostics). */
  id?: number;
  page: number;
  at: number;
  /** Where a freshly captured page came from (absent for pages rendered on save). */
  scanner?: 'system' | 'camera';
  filter: string;
  profile: string;
  stages: Partial<Record<DiagnosticStage, StageInfo>>;
  /** OneScan camera only: HD/MAX tier and JPEG quality the still was captured at. */
  capture?: { engine?: string; tier?: string; jpegQuality?: number };
  /** Milliseconds: shutter → file (capture), file → enhanced preview (process). */
  timings?: { captureMs?: number; processMs?: number };
  /** Why the automatic crop chose what it chose (dev diagnostics). */
  crop?: {
    candidates: number;
    selected: string;
    area: number;
    textCoverage: number;
    textDensity: number;
    paperScore: number;
    edgeScore: number;
    backgroundPenalty: number;
    confidence: number;
    decision: string;
    marginGrown: boolean;
    ms: number;
  };
  /** The user adjusted this page's automatic crop by hand. */
  cropCorrected?: boolean;
}

interface DiagnosticsState {
  pages: PageDiagnostics[];
  record: (page: Omit<PageDiagnostics, 'at'>) => number;
  markCropCorrected: (id: number) => void;
  /** Add a stage to the most recent entry for `page` (e.g. the document thumbnail). */
  attach: (page: number, stage: DiagnosticStage, info: StageInfo | undefined) => void;
  clear: () => void;
}

const MAX_PAGES = 20;
let nextId = 0;

export const useScanDiagnostics = create<DiagnosticsState>((set) => ({
  pages: [],
  record: (page) => {
    const id = ++nextId;
    set((s) => ({ pages: [{ ...page, id, at: Date.now() }, ...s.pages].slice(0, MAX_PAGES) }));
    return id;
  },
  markCropCorrected: (id) => set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, cropCorrected: true } : p)) })),
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

const sizeLine = (s: StageInfo) => {
  const mb = s.bytes / (1024 * 1024);
  const parts = [`${s.width} × ${s.height}`, `${megapixels(s).toFixed(2)} MP`, mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(s.bytes / 1024)} KB`];
  if (s.quality) parts.push(`JPEG ${s.quality}`);
  if (s.degraded) parts.push('DEGRADED');
  return parts.join(' · ');
};

const stageNames: [DiagnosticStage, string][] = [
  ['source', 'Original'],
  ['master', 'Master'],
  ['preview', 'Preview'],
  ['thumbnail', 'Thumbnail'],
];

/**
 * Plain-text report of the measured numbers (oldest first) for pasting into a QA sheet.
 * Sizes, qualities and timings only — no file names, text or image content.
 */
export function diagnosticsReport(pages: PageDiagnostics[], header: string): string {
  const out = [header];
  for (const p of [...pages].reverse()) {
    const engine = p.capture?.engine ?? p.scanner;
    const what = p.page ? `Page ${p.page} saved` : 'Captured';
    const tier = p.capture?.tier ? ` · ${p.capture.tier.toUpperCase()}` : '';
    out.push('', `— ${what}${engine ? ` · ${engine}` : ''}${tier} · profile ${p.profile} · filter ${p.filter}`);
    if (p.capture?.jpegQuality) out.push(`Camera JPEG: ${p.capture.jpegQuality}`);
    for (const [k, name] of stageNames) {
      const s = p.stages[k];
      if (s) out.push(`${name}: ${sizeLine(s)}`);
    }
    if (p.timings) out.push(`Capture: ${p.timings.captureMs ?? '–'} ms · Process: ${p.timings.processMs ?? '–'} ms`);
    if (p.crop) out.push(...cropLines(p.crop));
    if (p.cropCorrected) out.push('User corrected crop: true');
  }
  return out.join('\n');
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Crop debug block (dev diagnostics, spec "Debug Diagnostics"). */
export function cropLines(c: NonNullable<PageDiagnostics['crop']>): string[] {
  return [
    `Candidates: ${c.candidates} · Selected: ${c.selected}`,
    `Area: ${pct(c.area)} · Text coverage: ${pct(c.textCoverage)} · Text density: ${pct(c.textDensity)}`,
    `Paper score: ${c.paperScore.toFixed(2)} · Edge score: ${c.edgeScore.toFixed(2)} · Background penalty: ${c.backgroundPenalty.toFixed(2)}`,
    `Final confidence: ${c.confidence.toFixed(2)} · Auto crop: ${c.decision === 'manual' ? 'false' : 'true'} (${c.decision})${c.marginGrown ? ' · text margin added' : ''} · ${c.ms} ms`,
  ];
}
