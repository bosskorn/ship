import { create } from 'zustand';
import type { CaptureMode, DocumentType, DraftPage } from '@/core/document-engine/model';
import { newId } from '@/core/document-engine/ids';

/** Document State for the in-progress (unsaved) scan. Memory only, never persisted. */
interface ScanSessionState {
  sessionId: string;
  mode: CaptureMode;
  docType: DocumentType;
  pages: DraftPage[];
  /** Multi-page capture state for this scan (starts single-page; never persisted). */
  multi: boolean;
  setMulti: (v: boolean) => void;
  /** Index of the page being re-scanned, if any. */
  rescanIndex: number | null;
  /** Camera was opened from the editor (add/rescan): return with back(), don't stack a new editor. */
  fromEditor: boolean;
  setFromEditor: (v: boolean) => void;
  /** Set when editing a saved document (save updates it in place). */
  editingDocumentId: string | null;
  edit: (documentId: string, pages: DraftPage[]) => void;
  start: (opts?: { mode?: CaptureMode; docType?: DocumentType }) => void;
  setMode: (m: CaptureMode) => void;
  addPage: (p: DraftPage) => void;
  replacePage: (index: number, p: DraftPage) => void;
  /** Patch a page by id (background processing finished); no-op if it was removed. */
  updatePage: (id: string, patch: Partial<DraftPage>) => void;
  removePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  movePage: (from: number, to: number) => void;
  setRescan: (index: number | null) => void;
  clear: () => void;
}

export const docTypeForMode: Record<CaptureMode, DocumentType> = {
  auto: 'document',
  document: 'document',
  id: 'id_card',
  receipt: 'receipt',
};

/** Scanner mode that best fits a document type (Tools → Book opens Document mode, etc.). */
export function modeForDocType(docType: DocumentType): CaptureMode {
  if (docType === 'id_card') return 'id';
  if (docType === 'receipt') return 'receipt';
  return 'document';
}

export const useScanSession = create<ScanSessionState>((set) => ({
  sessionId: newId(),
  mode: 'auto',
  docType: 'document',
  pages: [],
  multi: false,
  setMulti: (multi) => set({ multi }),
  rescanIndex: null,
  fromEditor: false,
  setFromEditor: (fromEditor) => set({ fromEditor }),
  editingDocumentId: null,
  edit: (editingDocumentId, pages) => set({ sessionId: newId(), editingDocumentId, pages, rescanIndex: null, fromEditor: false }),
  start: (opts) =>
    set({
      sessionId: newId(),
      mode: opts?.mode ?? (opts?.docType ? modeForDocType(opts.docType) : 'auto'),
      docType: opts?.docType ?? docTypeForMode[opts?.mode ?? 'auto'],
      pages: [],
      multi: false,
      rescanIndex: null,
      fromEditor: false,
      editingDocumentId: null,
    }),
  setMode: (mode) => set((s) => ({ mode, docType: s.docType === docTypeForMode[s.mode] ? docTypeForMode[mode] : s.docType })),
  addPage: (p) => set((s) => ({ pages: [...s.pages, p] })),
  replacePage: (index, p) => set((s) => ({ pages: s.pages.map((x, i) => (i === index ? p : x)) })),
  updatePage: (id, patch) => set((s) => ({ pages: s.pages.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removePage: (index) => set((s) => ({ pages: s.pages.filter((_, i) => i !== index) })),
  duplicatePage: (index) =>
    set((s) => {
      const copy = { ...s.pages[index], id: newId() };
      const pages = [...s.pages];
      pages.splice(index + 1, 0, copy);
      return { pages };
    }),
  movePage: (from, to) =>
    set((s) => {
      if (to < 0 || to >= s.pages.length) return s;
      const pages = [...s.pages];
      const [p] = pages.splice(from, 1);
      pages.splice(to, 0, p);
      return { pages };
    }),
  setRescan: (rescanIndex) => set({ rescanIndex }),
  clear: () => set({ pages: [], multi: false, rescanIndex: null, fromEditor: false, editingDocumentId: null, sessionId: newId() }),
}));
