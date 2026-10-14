import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import { tagRepository } from '@/core/database/repositories/tagRepository';
import type { DocumentRecord, DocumentType, SystemFolderKey } from '../model';

/** What OneScan actually stores about a document — nothing here is estimated or invented. */
export interface DocumentInfo {
  title: string;
  docType: DocumentType;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  sizeBytes: number;
  /** Folder name, or null when the document is in no folder (system folders keep their key). */
  folder: { name: string; systemKey: SystemFolderKey | null } | null;
  tags: string[];
}

export const DocumentMetadataService = {
  async setFavorite(doc: Pick<DocumentRecord, 'id'>, favorite: boolean): Promise<void> {
    await documentRepository.setFavorite(doc.id, favorite);
  },

  async info(doc: DocumentRecord): Promise<DocumentInfo> {
    const [folders, tags] = await Promise.all([doc.folderId ? folderRepository.list() : Promise.resolve([]), tagRepository.forDocument(doc.id)]);
    const f = doc.folderId ? folders.find((x) => x.id === doc.folderId) : undefined;
    return {
      title: doc.title,
      docType: doc.docType,
      pageCount: doc.pageCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sizeBytes: doc.sizeBytes,
      folder: f ? { name: f.name, systemKey: f.systemKey } : null,
      tags: tags.map((t) => t.name),
    };
  },
};
