/**
 * Document Tools Phase A — favourites, tags, document info, search filters. Real SQLite
 * (node:sqlite) with the app's own migrations and repository SQL.
 */
import { migrations } from '@/core/database/migrations';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { TagService, TagServiceError } from '@/core/document-engine/services/TagService';
import { DocumentMetadataService } from '@/core/document-engine/services/DocumentMetadataService';

type Db = { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; get(...a: unknown[]): Record<string, unknown> | undefined; run(...a: unknown[]): unknown } };
const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (p: string) => Db } }).getBuiltinModule('node:sqlite');
let mockDb: Db;
jest.mock('@/core/database/db', () => ({
  getDatabase: async () => ({
    getAllAsync: async (sql: string, ...args: unknown[]) => mockDb.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, ...args: unknown[]) => mockDb.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, ...args: unknown[]) => mockDb.prepare(sql).run(...args),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await fn();
        mockDb.exec('COMMIT');
      } catch (e) {
        mockDb.exec('ROLLBACK');
        throw e;
      }
    },
  }),
}));

let mockSeq = 0;
jest.mock('@/core/document-engine/ids', () => ({ newId: () => `id-${++mockSeq}` }));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 3);
function addDoc(id: string, o: { title?: string; type?: string; folder?: string | null; created?: number; deleted?: boolean; body?: string } = {}) {
  mockDb.prepare(
    `INSERT INTO documents (id, title, doc_type, folder_id, page_count, size_bytes, pdf_uri, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, 2, 412000, ?, ?, ?, ?)`,
  ).run(id, o.title ?? id, o.type ?? 'document', o.folder ?? null, `file:///docs/${id}/doc.pdf`, o.created ?? NOW, (o.created ?? NOW) + 1, o.deleted ? NOW : null);
  mockDb.prepare('INSERT INTO document_fts (document_id, title, body) VALUES (?, ?, ?)').run(id, o.title ?? id, o.body ?? '');
}
const ids = (docs: { id: string }[]) => docs.map((d) => d.id).sort();

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('PRAGMA foreign_keys = ON');
  for (const m of migrations) mockDb.exec(m);
  mockDb.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, 1)').run('f-work', 'งาน');
  addDoc('a', { title: 'ใบเสร็จร้านกาแฟ', type: 'receipt', folder: 'f-work', body: 'ยอดรวม 120 บาท' });
  addDoc('b', { title: 'Lease', type: 'contract', created: NOW - 40 * DAY, body: 'monthly rent' });
  addDoc('c', { title: 'บัตรประชาชน', type: 'id_card', created: NOW - 3 * DAY });
  addDoc('z', { title: 'ในถังขยะ', deleted: true });
});

describe('favourites', () => {
  it('add/remove is reflected in list, get and search; adding twice is harmless', async () => {
    await DocumentMetadataService.setFavorite({ id: 'a' }, true);
    await DocumentMetadataService.setFavorite({ id: 'a' }, true);
    expect((await documentRepository.get('a'))!.isFavorite).toBe(true);
    expect((await documentRepository.list()).filter((d) => d.isFavorite).map((d) => d.id)).toEqual(['a']);
    expect(ids(await documentRepository.search('', 100, { favorite: true }))).toEqual(['a']);
    await DocumentMetadataService.setFavorite({ id: 'a' }, false);
    expect((await documentRepository.get('a'))!.isFavorite).toBe(false);
  });

  it('never touches the document row, pages, files or search index', async () => {
    const before = mockDb.prepare("SELECT * FROM documents WHERE id = 'a'").get();
    const fts = mockDb.prepare("SELECT * FROM document_fts WHERE document_id = 'a'").get();
    await DocumentMetadataService.setFavorite({ id: 'a' }, true);
    expect(mockDb.prepare("SELECT * FROM documents WHERE id = 'a'").get()).toEqual(before);
    expect(mockDb.prepare("SELECT * FROM document_fts WHERE document_id = 'a'").get()).toEqual(fts);
  });
});

describe('tags', () => {
  it('create, rename, case-insensitive uniqueness and validation', async () => {
    const tax = await TagService.create('  ภาษี  ');
    await expect(TagService.create('ภาษี')).rejects.toEqual(new TagServiceError('exists'));
    const work = await TagService.create('Work');
    await expect(TagService.create('work')).rejects.toMatchObject({ code: 'exists' });
    await expect(TagService.create('   ')).rejects.toMatchObject({ code: 'empty' });
    await expect(TagService.create('x'.repeat(31))).rejects.toMatchObject({ code: 'too_long' });
    await expect(TagService.rename(work, 'ภาษี')).rejects.toMatchObject({ code: 'exists' });
    await TagService.rename(work, 'WORK');
    expect((await TagService.list()).map((t) => t.name)).toEqual(['WORK', 'ภาษี']);
    expect(tax).toBeTruthy();
  });

  it('a document can have several tags; counts skip the trash; assignments map', async () => {
    const tax = await TagService.create('ภาษี');
    const work = await TagService.create('งาน');
    await TagService.setAssigned('a', tax, true);
    await TagService.setAssigned('a', work, true);
    await TagService.setAssigned('a', work, true);
    await TagService.setAssigned('b', tax, true);
    await TagService.setAssigned('z', tax, true);
    expect((await TagService.forDocument('a')).map((t) => t.name).sort()).toEqual(['งาน', 'ภาษี']);
    expect((await TagService.list()).find((t) => t.id === tax)!.count).toBe(2);
    const map = await TagService.assignments();
    expect(map.a.sort()).toEqual([tax, work].sort());
    await TagService.setAssigned('a', work, false);
    expect((await TagService.forDocument('a')).map((t) => t.name)).toEqual(['ภาษี']);
  });

  it('deleting a tag removes it from documents but deletes no document; folder is unchanged', async () => {
    const tax = await TagService.create('ภาษี');
    await TagService.setAssigned('a', tax, true);
    await TagService.remove(tax);
    expect(await TagService.list()).toEqual([]);
    expect(await TagService.forDocument('a')).toEqual([]);
    const a = await documentRepository.get('a');
    expect(a).not.toBeNull();
    expect(a!.folderId).toBe('f-work');
  });
});

describe('search filters (local)', () => {
  it('type, date, folder, tag and favourite narrow results, alone and with a query', async () => {
    const tax = await TagService.create('ภาษี');
    await TagService.setAssigned('b', tax, true);
    await DocumentMetadataService.setFavorite({ id: 'c' }, true);
    expect(ids(await documentRepository.search('', 100, { docType: 'receipt' }))).toEqual(['a']);
    expect(ids(await documentRepository.search('', 100, { from: NOW - 7 * DAY }))).toEqual(['a', 'c']);
    expect(ids(await documentRepository.search('', 100, { folderId: 'f-work' }))).toEqual(['a']);
    expect(ids(await documentRepository.search('', 100, { tagId: tax }))).toEqual(['b']);
    expect(ids(await documentRepository.search('', 100, { favorite: true }))).toEqual(['c']);
    expect(ids(await documentRepository.search('rent', 100, { tagId: tax }))).toEqual(['b']);
    expect(ids(await documentRepository.search('rent', 100, { docType: 'receipt' }))).toEqual([]);
    expect(ids(await documentRepository.search('ยอดรวม', 100, { folderId: 'f-work' }))).toEqual(['a']);
  });

  it('documents in the trash never appear', async () => {
    const tax = await TagService.create('ภาษี');
    await TagService.setAssigned('z', tax, true);
    expect(ids(await documentRepository.search('', 100, { tagId: tax }))).toEqual([]);
  });
});

describe('document info', () => {
  it('reports stored values only: folder, tags, dates, size, pages', async () => {
    const tax = await TagService.create('ภาษี');
    await TagService.setAssigned('a', tax, true);
    const doc = (await documentRepository.get('a'))!;
    const info = await DocumentMetadataService.info(doc);
    expect(info).toEqual({
      title: 'ใบเสร็จร้านกาแฟ',
      docType: 'receipt',
      pageCount: 2,
      createdAt: NOW,
      updatedAt: NOW + 1,
      sizeBytes: 412000,
      folder: { name: 'งาน', systemKey: null },
      tags: ['ภาษี'],
    });
    expect(Object.keys(info)).not.toContain('ocrLanguage');
    const none = await DocumentMetadataService.info((await documentRepository.get('c'))!);
    expect(none.folder).toBeNull();
    expect(none.tags).toEqual([]);
  });
});
