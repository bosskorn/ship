/**
 * Upgrade 1.2 → 1.3: schema v3 is additive. A real SQLite database (node:sqlite, FTS5) holding
 * 1.2.0 data is migrated exactly as the app does (one transaction per step) and every
 * document, page, folder and search entry must come out unchanged.
 */
import { createHash } from 'crypto';
import { migrations } from '@/core/database/migrations';

type Db = { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; get(...a: unknown[]): Record<string, unknown> | undefined; run(...a: unknown[]): unknown } };
const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (p: string) => Db } }).getBuiltinModule('node:sqlite');

const version = (db: Db) => Number(db.prepare('PRAGMA user_version').get()!.user_version);

/** Same as db.ts `migrate`: each step and its version number commit together. */
function migrate(db: Db, upTo = migrations.length, failAt?: number) {
  let v = version(db);
  while (v < upTo) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[v]);
      if (failAt === v + 1) throw new Error('killed');
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    v += 1;
  }
}

function v12Database(): Db {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, 2);
  db.exec(`
    INSERT INTO folders (id, name, created_at) VALUES ('f1', 'งาน', 1);
    INSERT INTO documents (id, title, folder_id, page_count, size_bytes, pdf_uri, thumbnail_uri, created_at, updated_at)
      VALUES ('d1', 'ใบแจ้งหนี้ค่าไฟ ต.ค.', 'f1', 2, 958000, 'file:///docs/d1/doc.pdf', 'file:///docs/d1/t.jpg', 10, 20),
             ('d2', 'Lease agreement', NULL, 20, 3870000, 'file:///docs/d2/doc.pdf', 'file:///docs/d2/t.jpg', 11, 21);
    INSERT INTO pages (id, document_id, page_index, image_uri, width, height, source_uri, preview_uri, quad)
      VALUES ('p1', 'd1', 0, 'file:///docs/d1/p0.jpg', 1240, 1754, 'file:///docs/d1/s0.jpg', 'file:///docs/d1/v0.jpg', '[]'),
             ('p2', 'd1', 1, 'file:///docs/d1/p1.jpg', 1240, 1754, NULL, NULL, NULL);
    INSERT INTO document_fts (document_id, title, body) VALUES
      ('d1', 'ใบแจ้งหนี้ค่าไฟ ต.ค.', 'การไฟฟ้านครหลวง ยอดชำระ 1,284.50 บาท'),
      ('d2', 'Lease agreement', 'monthly rent deposit');
  `);
  return db;
}

const snapshot = (db: Db) => ({
  folders: db.prepare('SELECT * FROM folders ORDER BY id').all(),
  documents: db.prepare('SELECT * FROM documents ORDER BY id').all(),
  pages: db.prepare('SELECT * FROM pages ORDER BY id').all(),
  fts: db.prepare('SELECT document_id, title, body FROM document_fts ORDER BY document_id').all(),
});

describe('1.2 → 1.3 database upgrade', () => {
  it('migrations v1–v2 are byte-for-byte those of 1.2.0', () => {
    const h = createHash('sha256').update(migrations[0] + '\u0000' + migrations[1]).digest('hex');
    expect(h).toBe('c6a2adc7858cf91f6f369ba7f4849c5989486ecc4c7779c44ec1ce9fc2f958c3');
  });

  it('v3 only adds app_meta: no ALTER/DROP/UPDATE/DELETE of existing tables', () => {
    expect(migrations).toHaveLength(3);
    const v3 = migrations[2].replace(/\/\*[\s\S]*?\*\//g, '');
    expect(v3).toMatch(/CREATE TABLE IF NOT EXISTS app_meta/);
    expect(v3).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|INSERT)\b/i);
    expect(v3).not.toMatch(/documents|pages|folders|document_fts/);
  });

  it('existing documents, pages, folders and search survive unchanged; no duplicates', () => {
    const db = v12Database();
    const before = snapshot(db);
    migrate(db);
    expect(version(db)).toBe(3);
    expect(snapshot(db)).toEqual(before);
    const hits = db.prepare("SELECT document_id FROM document_fts WHERE document_fts MATCH ?").all('"ยอดชำระ"');
    expect(hits).toEqual([{ document_id: 'd1' }]);
    expect(db.prepare("SELECT document_id FROM document_fts WHERE document_fts MATCH 'rent'").all()).toEqual([{ document_id: 'd2' }]);
    expect(db.prepare('SELECT count(*) AS n FROM app_meta').get()!.n).toBe(0);
  });

  it('a kill during v3 leaves 1.2 intact, and the next start completes it', () => {
    const db = v12Database();
    const before = snapshot(db);
    expect(() => migrate(db, 3, 3)).toThrow('killed');
    expect(version(db)).toBe(2);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'app_meta'").get()).toBeUndefined();
    expect(snapshot(db)).toEqual(before);
    migrate(db);
    expect(version(db)).toBe(3);
    expect(snapshot(db)).toEqual(before);
  });

  it('v3 is idempotent (safe to re-run)', () => {
    const db = v12Database();
    migrate(db);
    expect(() => db.exec(migrations[2])).not.toThrow();
  });

  it('a fresh 1.3 install creates the full schema', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    expect(version(db)).toBe(3);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['documents', 'pages', 'folders', 'app_meta']));
  });
});
