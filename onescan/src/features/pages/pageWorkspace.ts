import { create } from 'zustand';
import type { DocumentType } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';

/**
 * What the Page Manager screen is working on (memory only, never persisted):
 * `document` edits a saved document's pages in place; `images` and `merge` create a new
 * document and leave every source untouched.
 */
export type PagePurpose = 'document' | 'images' | 'merge';

interface PageWorkspaceState {
  purpose: PagePurpose | null;
  /** The document being edited (`document`). */
  documentId: string | null;
  docType: DocumentType;
  items: PageItem[];
  /** Changed since opened (discard prompt). */
  dirty: boolean;
  open: (opts: { purpose: PagePurpose; items: PageItem[]; documentId?: string | null; docType?: DocumentType }) => void;
  setItems: (items: PageItem[]) => void;
  clear: () => void;
}

export const usePageWorkspace = create<PageWorkspaceState>((set) => ({
  purpose: null,
  documentId: null,
  docType: 'document',
  items: [],
  dirty: false,
  open: ({ purpose, items, documentId = null, docType = 'document' }) => set({ purpose, items, documentId, docType, dirty: false }),
  setItems: (items) => set({ items, dirty: true }),
  clear: () => set({ purpose: null, documentId: null, items: [], dirty: false }),
}));
