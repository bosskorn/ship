import { create } from 'zustand';
import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord, FolderRecord, TagRecord } from '@/core/document-engine/model';
import { TagService } from '@/core/document-engine/services/TagService';

/** Document State: cached lists for the Documents/Home screens. Source of truth is the local DB. */
interface DocumentsState {
  documents: DocumentRecord[];
  recent: DocumentRecord[];
  folders: FolderRecord[];
  tags: TagRecord[];
  /** documentId → tag ids. */
  tagMap: Record<string, string[]>;
  loaded: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

export const useDocuments = create<DocumentsState>((set) => ({
  documents: [],
  recent: [],
  folders: [],
  tags: [],
  tagMap: {},
  loaded: false,
  error: false,
  refresh: async () => {
    try {
      const [documents, recent, folders, tags, tagMap] = await Promise.all([
        documentRepository.list(),
        documentRepository.list({ orderBy: 'opened', limit: 5 }),
        folderRepository.list(),
        TagService.list().catch(() => []),
        TagService.assignments().catch(() => ({})),
      ]);
      // Empty auto-category folders (created by versions before 1.2.0) are not shown.
      set({ documents, recent, folders: folders.filter((f) => !f.systemKey || f.itemCount > 0), tags, tagMap, loaded: true, error: false });
    } catch {
      set({ loaded: true, error: true });
    }
  },
}));
