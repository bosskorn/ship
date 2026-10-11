import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

export type Database = SQLite.SQLiteDatabase;

let dbPromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync('onescan.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: Database) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    // PRAGMA cannot be parameterised; `version` is an integer we control.
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
