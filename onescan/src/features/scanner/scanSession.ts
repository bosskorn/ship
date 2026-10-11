import { create } from 'zustand';
import type { CaptureMode, DocumentType, DraftPage } from '@/core/document-engine/model';
import { newId } from '@/core/document-engine/ids';

/** Document State for the in-progress (unsaved) scan. Memory only, never persisted. */
interface ScanSessionState {
  sessionId: string;
  mode: CaptureMode;
  docType: DocumentType;
  pages: DraftPage[];
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
  removePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  movePage: (from: number, to: number) => void;
  setRescan: (index: number | null) => void;
  clear: () => void;
}

const docTypeForMode: Record<CaptureMode, DocumentType> = {
  document: 'document',
  id: 'id_card',
  book: 'book',
  whiteboard: 'whiteboard',
};

export const useScanSession = create<ScanSessionState>((set) => ({
  sessionId: newId(),
  mode: 'document',
  docType: 'document',
  pages: [],
  rescanIndex: null,
  fromEditor: false,
  setFromEditor: (fromEditor) => set({ fromEditor }),
  editingDocumentId: null,
  edit: (editingDocumentId, pages) => set({ sessionId: newId(), editingDocumentId, pages, rescanIndex: null, fromEditor: false }),
  start: (opts) =>
    set({
      sessionId: newId(),
      mode: opts?.mode ?? 'document',
      docType: opts?.docType ?? docTypeForMode[opts?.mode ?? 'document'],
      pages: [],
      rescanIndex: null,
      fromEditor: false,
      editingDocumentId: null,
    }),
  setMode: (mode) => set((s) => ({ mode, docType: s.docType === docTypeForMode[s.mode] ? docTypeForMode[mode] : s.docType })),
  addPage: (p) => set((s) => ({ pages: [...s.pages, p] })),
  replacePage: (index, p) => set((s) => ({ pages: s.pages.map((x, i) => (i === index ? p : x)) })),
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
  clear: () => set({ pages: [], rescanIndex: null, fromEditor: false, editingDocumentId: null, sessionId: newId() }),
}));
