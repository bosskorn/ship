import { getDatabase } from '../db';
import {
  DocumentRecord,
  DocumentType,
  FolderRecord,
  PageRecord,
  PageFilter,
  Quad,
  Rotation,
  SyncState,
  SystemFolderKey,
} from '@/core/document-engine/model';
import { newId } from '@/core/document-engine/ids';
import { monthRange, parseSearchQuery, toFtsMatch } from '../searchQuery';

const INSERT_PAGE = `INSERT INTO pages (id, document_id, page_index, image_uri, width, height, filter, rotation, source_uri, preview_uri, quad)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

type NewPage = Omit<PageRecord, 'id' | 'documentId'>;

function pageValues(documentId: string, p: NewPage) {
  return [
    newId(), documentId, p.pageIndex, p.imageUri, p.width, p.height, p.filter, p.rotation,
    p.sourceUri ?? null, p.previewUri ?? null, p.quad ? JSON.stringify(p.quad) : null,
  ] as const;
}

function parseQuad(s: string | null): Quad | null {
  if (!s) return null;
  try {
    const q = JSON.parse(s) as Quad;
    return Array.isArray(q) && q.length === 4 && q.every((p) => typeof p?.x === 'number' && typeof p?.y === 'number') ? q : null;
  } catch {
    return null;
  }
}

interface DocumentRow {
  id: string;
  title: string;
  doc_type: string;
  folder_id: string | null;
  page_count: number;
  size_bytes: number;
  pdf_uri: string | null;
  thumbnail_uri: string | null;
  has_sensitive: number;
  is_redacted_copy: number;
  created_at: number;
  updated_at: number;
  opened_at: number | null;
  deleted_at: number | null;
  sync_state: string;
}

function toRecord(r: DocumentRow): DocumentRecord {
  return {
    id: r.id,
    title: r.title,
    docType: r.doc_type as DocumentType,
    folderId: r.folder_id,
    pageCount: r.page_count,
    sizeBytes: r.size_bytes,
    pdfUri: r.pdf_uri,
    thumbnailUri: r.thumbnail_uri,
    hasSensitive: r.has_sensitive === 1,
    isRedactedCopy: r.is_redacted_copy === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    openedAt: r.opened_at,
    deletedAt: r.deleted_at,
    syncState: r.sync_state as SyncState,
  };
}

export interface NewDocument {
  title: string;
  docType: DocumentType;
  folderId?: string | null;
  pdfUri: string;
  thumbnailUri: string | null;
  sizeBytes: number;
  pages: NewPage[];
  /** Defaults to `pages.length`; imported PDFs have no page images. */
  pageCount?: number;
  hasSensitive?: boolean;
  ocrText?: string;
  isRedactedCopy?: boolean;
  sourceDocumentId?: string | null;
}

export const documentRepository = {
  async create(input: NewDocument): Promise<DocumentRecord> {
    const db = await getDatabase();
    const id = newId();
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO documents (id, title, doc_type, folder_id, page_count, size_bytes, pdf_uri, thumbnail_uri, has_sensitive,
           is_redacted_copy, source_document_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, input.title, input.docType, input.folderId ?? null, input.pageCount ?? input.pages.length, input.sizeBytes,
        input.pdfUri, input.thumbnailUri, input.hasSensitive ? 1 : 0, input.isRedactedCopy ? 1 : 0, input.sourceDocumentId ?? null, now, now,
      );
      for (const p of input.pages) {
        await db.runAsync(
          INSERT_PAGE,
          ...pageValues(id, p),
        );
      }
      await db.runAsync(`INSERT INTO document_fts (document_id, title, body) VALUES (?, ?, ?)`, id, input.title, input.ocrText ?? '');
    });
    return (await this.get(id))!;
  },

  async get(id: string): Promise<DocumentRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ?', id);
    return row ? toRecord(row) : null;
  },

  async list(opts: { folderId?: string; limit?: number; orderBy?: 'updated' | 'opened' } = {}): Promise<DocumentRecord[]> {
    const db = await getDatabase();
    const order = opts.orderBy === 'opened' ? 'COALESCE(opened_at, updated_at) DESC' : 'updated_at DESC';
    const where = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (opts.folderId) {
      where.push('folder_id = ?');
      params.push(opts.folderId);
    }
    params.push(opts.limit ?? 500);
    const rows = await db.getAllAsync<DocumentRow>(
      `SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
      ...params,
    );
    return rows.map(toRecord);
  },

  async pages(documentId: string): Promise<PageRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string; document_id: string; page_index: number; image_uri: string; width: number; height: number; filter: string; rotation: number;
      source_uri: string | null; preview_uri: string | null; quad: string | null;
    }>('SELECT * FROM pages WHERE document_id = ? ORDER BY page_index', documentId);
    return rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      pageIndex: r.page_index,
      imageUri: r.image_uri,
      width: r.width,
      height: r.height,
      filter: r.filter as PageFilter,
      rotation: r.rotation as Rotation,
      sourceUri: r.source_uri,
      previewUri: r.preview_uri,
      quad: parseQuad(r.quad),
    }));
  },

  /** Replace a document's pages, files and OCR index after editing (in place). */
  async replaceContent(
    id: string,
    input: Pick<NewDocument, 'pdfUri' | 'thumbnailUri' | 'sizeBytes' | 'pages' | 'ocrText' | 'hasSensitive'>,
  ) {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM pages WHERE document_id = ?', id);
      for (const p of input.pages) {
        await db.runAsync(
          INSERT_PAGE,
          ...pageValues(id, p),
        );
      }
      await db.runAsync(
        `UPDATE documents SET page_count = ?, size_bytes = ?, pdf_uri = ?, thumbnail_uri = ?, has_sensitive = ?, updated_at = ? WHERE id = ?`,
        input.pages.length, input.sizeBytes, input.pdfUri, input.thumbnailUri, input.hasSensitive ? 1 : 0, Date.now(), id,
      );
      await db.runAsync('UPDATE document_fts SET body = ? WHERE document_id = ?', input.ocrText ?? '', id);
    });
  },

  async ocrText(documentId: string): Promise<string> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ body: string }>('SELECT body FROM document_fts WHERE document_id = ?', documentId);
    return row?.body ?? '';
  },

  async setOcrText(documentId: string, text: string, hasSensitive: boolean) {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE document_fts SET body = ? WHERE document_id = ?', text, documentId);
      await db.runAsync('UPDATE documents SET has_sensitive = ?, updated_at = ? WHERE id = ?', hasSensitive ? 1 : 0, Date.now(), documentId);
    });
  },

  async rename(id: string, title: string) {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?', title, Date.now(), id);
      await db.runAsync('UPDATE document_fts SET title = ? WHERE document_id = ?', title, id);
    });
  },

  async move(id: string, folderId: string | null) {
    const db = await getDatabase();
    await db.runAsync('UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?', folderId, Date.now(), id);
  },

  async markOpened(id: string) {
    const db = await getDatabase();
    await db.runAsync('UPDATE documents SET opened_at = ? WHERE id = ?', Date.now(), id);
  },

  /** Soft delete → Trash. */
  async trash(id: string) {
    const db = await getDatabase();
    await db.runAsync('UPDATE documents SET deleted_at = ? WHERE id = ?', Date.now(), id);
  },

  async restore(id: string) {
    const db = await getDatabase();
    await db.runAsync('UPDATE documents SET deleted_at = NULL WHERE id = ?', id);
  },

  /** Removes the DB rows; caller (DocumentEngine) removes files. */
  async purge(id: string) {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM document_fts WHERE document_id = ?', id);
      await db.runAsync('DELETE FROM documents WHERE id = ?', id);
    });
  },

  async trashed(): Promise<DocumentRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    return rows.map(toRecord);
  },

  async expiredTrash(retentionDays: number): Promise<DocumentRecord[]> {
    const db = await getDatabase();
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const rows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < ?', cutoff);
    return rows.map(toRecord);
  },

  /** Local-only search across title, OCR text, folder name, type and date. */
  async search(query: string, limit = 100): Promise<DocumentRecord[]> {
    const q = parseSearchQuery(query);
    const db = await getDatabase();
    const where: string[] = ['d.deleted_at IS NULL'];
    const params: (string | number)[] = [];

    const match = toFtsMatch(q.terms);
    const textClauses: string[] = [];
    if (match) {
      textClauses.push('d.id IN (SELECT document_id FROM document_fts WHERE document_fts MATCH ?)');
      params.push(match);
      for (const term of q.terms) {
        textClauses.push('f.name LIKE ?');
        params.push(`%${term}%`);
        // unicode61 does not segment Thai/CJK (no spaces), so FTS misses in-word matches.
        if (/[^\x00-\x7F]/.test(term)) {
          textClauses.push('d.id IN (SELECT document_id FROM document_fts WHERE body LIKE ? OR title LIKE ?)');
          params.push(`%${term}%`, `%${term}%`);
        }
      }
    }
    if (q.docTypes.length) {
      textClauses.push(`d.doc_type IN (${q.docTypes.map(() => '?').join(',')})`);
      params.push(...q.docTypes);
    }
    if (textClauses.length) where.push(`(${textClauses.join(' OR ')})`);

    if (q.month && q.year) {
      const [from, to] = monthRange(q.year, q.month);
      where.push('d.created_at >= ? AND d.created_at < ?');
      params.push(from, to);
    } else if (q.month) {
      where.push(`CAST(strftime('%m', d.created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) = ?`);
      params.push(q.month);
    } else if (q.year) {
      where.push(`CAST(strftime('%Y', d.created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) = ?`);
      params.push(q.year);
    }

    params.push(limit);
    const rows = await db.getAllAsync<DocumentRow>(
      `SELECT d.* FROM documents d LEFT JOIN folders f ON f.id = d.folder_id
       WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC LIMIT ?`,
      ...params,
    );
    return rows.map(toRecord);
  },
};

export const folderRepository = {
  async list(): Promise<FolderRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; name: string; system_key: string | null; created_at: number; item_count: number }>(
      `SELECT f.*, (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.deleted_at IS NULL) AS item_count
       FROM folders f ORDER BY f.system_key IS NULL, f.created_at`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      systemKey: r.system_key as SystemFolderKey | null,
      createdAt: r.created_at,
      itemCount: r.item_count,
    }));
  },

  async bySystemKey(key: SystemFolderKey): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM folders WHERE system_key = ?', key);
    return row?.id ?? null;
  },

  async create(name: string): Promise<string> {
    const db = await getDatabase();
    const id = newId();
    await db.runAsync('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)', id, name, Date.now());
    return id;
  },
};
