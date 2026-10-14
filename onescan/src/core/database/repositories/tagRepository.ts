import { getDatabase } from '../db';
import { newId } from '@/core/document-engine/ids';
import type { TagRecord } from '@/core/document-engine/model';

/**
 * Tags (local DB, schema v1 `tags` / `document_tags`). Independent of folders: a document sits
 * in at most one folder but can carry any number of tags.
 */
export const tagRepository = {
  async list(): Promise<TagRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; name: string; count: number }>(
      `SELECT t.id, t.name, (SELECT COUNT(*) FROM document_tags dt JOIN documents d ON d.id = dt.document_id
         WHERE dt.tag_id = t.id AND d.deleted_at IS NULL) AS count
       FROM tags t ORDER BY t.name COLLATE NOCASE`,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, count: r.count }));
  },

  async findByName(name: string): Promise<{ id: string; name: string } | null> {
    const db = await getDatabase();
    return (await db.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE', name)) ?? null;
  },

  async create(name: string): Promise<string> {
    const db = await getDatabase();
    const id = newId();
    await db.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', id, name);
    return id;
  },

  async rename(id: string, name: string) {
    const db = await getDatabase();
    await db.runAsync('UPDATE tags SET name = ? WHERE id = ?', name, id);
  },

  /** Deletes the tag and its assignments (documents are untouched). */
  async remove(id: string) {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM document_tags WHERE tag_id = ?', id);
      await db.runAsync('DELETE FROM tags WHERE id = ?', id);
    });
  },

  async assign(documentId: string, tagId: string) {
    const db = await getDatabase();
    await db.runAsync('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)', documentId, tagId);
  },

  async unassign(documentId: string, tagId: string) {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?', documentId, tagId);
  },

  async forDocument(documentId: string): Promise<{ id: string; name: string }[]> {
    const db = await getDatabase();
    return db.getAllAsync<{ id: string; name: string }>(
      `SELECT t.id, t.name FROM tags t JOIN document_tags dt ON dt.tag_id = t.id WHERE dt.document_id = ? ORDER BY t.name COLLATE NOCASE`,
      documentId,
    );
  },

  /** documentId → tag ids, for filtering lists without a query per document. */
  async assignments(): Promise<Record<string, string[]>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ document_id: string; tag_id: string }>('SELECT document_id, tag_id FROM document_tags');
    const map: Record<string, string[]> = {};
    for (const r of rows) (map[r.document_id] ??= []).push(r.tag_id);
    return map;
  },
};
