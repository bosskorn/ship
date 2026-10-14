import type { Database } from '@/core/database/db';

/** Loaded on first use, so screens that only show account UI don't pull in the database. */
async function getDatabase(): Promise<Database> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDatabase: open } = require('@/core/database/db') as typeof import('@/core/database/db');
  return open();
}

/** Small key-value table in the encrypted database (schema v3). Not documents. */
export const appMeta = {
  async get(key: string): Promise<string | null> {
    const db = await getDatabase();
    return (await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key))?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  },
  /** Inserts only when absent; returns the stored value either way (race-safe). */
  async setIfAbsent(key: string, value: string): Promise<string> {
    const db = await getDatabase();
    await db.runAsync('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)', key, value);
    return (await this.get(key)) ?? value;
  },
  async remove(key: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM app_meta WHERE key = ?', key);
  },
};
