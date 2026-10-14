import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import { tagRepository } from '@/core/database/repositories/tagRepository';
import type { DocumentRecord, DocumentType, SystemFolderKey } from '../model';
import { DocumentFileStore } from '../storage/DocumentFileStore';

/** What OneScan actually stores about a document — nothing here is estimated or invented. */
export interface DocumentInfo {
  title: string;
  docType: DocumentType;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  /** The PDF's real size (what Share/Print hand over), measured now; null without a PDF. */
  pdfBytes: number | null;
  /** Everything the document occupies on this device (PDF, page images, thumbnail; encrypted). */
  storageBytes: number;
  /** Folder name, or null when the document is in no folder (system folders keep their key). */
  folder: { name: string; systemKey: SystemFolderKey | null } | null;
  tags: string[];
}

export const DocumentMetadataService = {
  async setFavorite(doc: Pick<DocumentRecord, 'id'>, favorite: boolean): Promise<void> {
    await documentRepository.setFavorite(doc.id, favorite);
  },

  /**
   * Called only when Document info opens (one document): sizes come from the files on disk,
   * not from a value cached at save time, and nothing here runs for document lists.
   */
  async info(doc: DocumentRecord): Promise<DocumentInfo> {
    const [folders, tags, pdfBytes] = await Promise.all([
      doc.folderId ? folderRepository.list() : Promise.resolve([]),
      tagRepository.forDocument(doc.id),
      doc.pdfUri ? DocumentFileStore.contentBytes(doc.pdfUri).catch(() => null) : Promise.resolve(null),
    ]);
    let storageBytes = 0;
    try {
      storageBytes = DocumentFileStore.storageBytes(doc.pdfUri);
    } catch {
      storageBytes = 0;
    }
    const f = doc.folderId ? folders.find((x) => x.id === doc.folderId) : undefined;
    return {
      title: doc.title,
      docType: doc.docType,
      pageCount: doc.pageCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      pdfBytes,
      storageBytes,
      folder: f ? { name: f.name, systemKey: f.systemKey } : null,
      tags: tags.map((t) => t.name),
    };
  },
};
