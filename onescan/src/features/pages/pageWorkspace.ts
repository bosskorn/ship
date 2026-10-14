import { create } from 'zustand';
import type { DocumentType } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';

/**
 * What the Page Manager screen is working on (memory only, never persisted):
 * `document` edits a saved document's pages; `images` and `merge` create a new document and
 * leave every source untouched. Nothing is written until Save (prepare → preview → commit).
 */
export type PagePurpose = 'document' | 'images' | 'merge';

/** Undo steps kept (each is a list of page references, not images). */
export const HISTORY_LIMIT = 50;

interface PageWorkspaceState {
  purpose: PagePurpose | null;
  /** The document being edited (`document`). */
  documentId: string | null;
  docType: DocumentType;
  items: PageItem[];
  /** Earlier states (undo) and undone states (redo). */
  past: PageItem[][];
  future: PageItem[][];
  /** Differs from what was opened (discard prompt; Save enabled for `document`). */
  dirty: boolean;
  open: (opts: { purpose: PagePurpose; items: PageItem[]; documentId?: string | null; docType?: DocumentType }) => void;
  /** A user edit: recorded for undo, clears redo. */
  setItems: (items: PageItem[]) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

/** Real unsaved changes: the page list differs from the one that was opened. */
const differs = (a: PageItem[], b: PageItem[]) =>
  a.length !== b.length || a.some((it, i) => it.key !== b[i].key || it.page !== b[i].page);

export const usePageWorkspace = create<PageWorkspaceState>((set, get) => {
  let opened: PageItem[] = [];
  return {
    purpose: null,
    documentId: null,
    docType: 'document',
    items: [],
    past: [],
    future: [],
    dirty: false,
    open: ({ purpose, items, documentId = null, docType = 'document' }) => {
      opened = items;
      set({ purpose, items, documentId, docType, past: [], future: [], dirty: false });
    },
    setItems: (items) => {
      const { items: current, past } = get();
      if (items === current) return;
      set({ items, past: [...past, current].slice(-HISTORY_LIMIT), future: [], dirty: differs(items, opened) });
    },
    undo: () => {
      const { past, items, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ items: prev, past: past.slice(0, -1), future: [items, ...future], dirty: differs(prev, opened) });
    },
    redo: () => {
      const { past, items, future } = get();
      if (!future.length) return;
      const next = future[0];
      set({ items: next, past: [...past, items], future: future.slice(1), dirty: differs(next, opened) });
    },
    clear: () => {
      opened = [];
      set({ purpose: null, documentId: null, items: [], past: [], future: [], dirty: false });
    },
  };
});

/** Every page the workspace has held (current, undo and redo states): for temp-file cleanup. */
export function allWorkspacePages(): PageItem[] {
  const { items, past, future } = usePageWorkspace.getState();
  return [items, ...past, ...future].flat();
}
