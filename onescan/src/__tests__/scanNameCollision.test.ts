/**
 * Auto file naming: several scans in the same minute must get distinct names, and nothing is
 * ever overwritten. Real SQLite (node:sqlite) with the app's schema and the repository query.
 */
import { migrations } from '@/core/database/migrations';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { nextScanTitle, scanFileName, uniqueTitle } from '@/features/scanner/fileName';

type Db = { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; run(...a: unknown[]): unknown } };
const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (p: string) => Db } }).getBuiltinModule('node:sqlite');
let mockDb: Db;

jest.mock('@/core/database/db', () => ({
  getDatabase: async () => ({
    getAllAsync: async (sql: string, ...args: unknown[]) => mockDb.prepare(sql).all(...args),
    runAsync: async (sql: string, ...args: unknown[]) => mockDb.prepare(sql).run(...args),
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
}));

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  for (const m of migrations) mockDb.exec(m);
});

let seq = 0;
function saveDoc(title: string) {
  seq += 1;
  mockDb.prepare(
    `INSERT INTO documents (id, title, page_count, size_bytes, pdf_uri, thumbnail_uri, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?, 1, 1)`,
  ).run(`doc-${seq}`, title, `file:///docs/doc-${seq}/doc.pdf`, `file:///docs/doc-${seq}/t.jpg`);
}

describe('scan names within the same minute', () => {
  const at = new Date(2026, 9, 14, 9, 5, 12).getTime();

  it('five scans in one minute: five distinct names, five distinct files', async () => {
    const titles: string[] = [];
    for (let i = 0; i < 5; i++) {
      const title = await nextScanTitle('', (b) => documentRepository.titlesLike(b), at + i * 1000);
      saveDoc(title);
      titles.push(title);
    }
    expect(titles).toEqual([
      'OneScan_2026-10-14_09-05',
      'OneScan_2026-10-14_09-05_2',
      'OneScan_2026-10-14_09-05_3',
      'OneScan_2026-10-14_09-05_4',
      'OneScan_2026-10-14_09-05_5',
    ]);
    const rows = mockDb.prepare('SELECT id, title, pdf_uri FROM documents').all();
    expect(new Set(rows.map((r) => r.title)).size).toBe(5);
    expect(new Set(rows.map((r) => r.pdf_uri)).size).toBe(5);
  });

  it('a renamed or similar title does not confuse the counter', async () => {
    saveDoc('OneScan_2026-10-14_09-05');
    saveDoc('OneScan_2026-10-14_09-05_7');
    saveDoc('OneScan_2026-10-14_09-055');
    saveDoc('OneScan%2026-10-14_09-05');
    const next = await nextScanTitle('', (b) => documentRepository.titlesLike(b), at);
    expect(next).toBe('OneScan_2026-10-14_09-05_2');
  });

  it('custom prefixes with SQL wildcard characters are matched literally', async () => {
    saveDoc('a_b%c_2026-10-14_09-05');
    expect(await documentRepository.titlesLike('a_b%c_2026-10-14_09-05')).toEqual(['a_b%c_2026-10-14_09-05']);
    expect(await documentRepository.titlesLike('aXbYc_2026-10-14_09-05')).toEqual([]);
  });

  it('a different minute starts fresh; lookup failure still yields a name', async () => {
    saveDoc(scanFileName('', at));
    expect(await nextScanTitle('', (b) => documentRepository.titlesLike(b), at + 60_000)).toBe('OneScan_2026-10-14_09-06');
    expect(await nextScanTitle('', async () => Promise.reject(new Error('db')), at)).toBe('OneScan_2026-10-14_09-05');
    expect(uniqueTitle('x', ['x', 'x_2', 'x_3'])).toBe('x_4');
  });
});
