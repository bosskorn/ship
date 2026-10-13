import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { OneScanVision } from '@/native/OneScanVision';
import { migrations } from './migrations';

export type Database = SQLite.SQLiteDatabase;

const DB_NAME = 'onescan.db';
const ENC_NAME = 'onescan.enc.db';
/** Written once the encrypted copy is verified; from then on the swap is completed on any start. */
const ENC_OK = 'onescan.enc.ok';
const BAK_NAME = 'onescan.plain.bak';

let dbPromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!dbPromise) {
    // A failed open is not cached: the next call tries again.
    dbPromise = open().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function open(): Promise<Database> {
  // Encrypted at rest (SQLCipher) with a key derived from the Keystore-protected data key.
  const key = OneScanVision?.databaseKeyAsync ? await OneScanVision.databaseKeyAsync() : null;
  if (key) await encryptLegacyDatabase(key);
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  if (key) await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: Database) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version];
    const next = version + 1;
    // The schema change and its version number commit together: a kill in between can
    // never leave a migration applied but unrecorded (it would fail on every later start).
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      // PRAGMA cannot be parameterised; `next` is an integer we control.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

const fileAt = (name: string) => new File(`file://${SQLite.defaultDatabaseDirectory}/${name}`);

function remove(name: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = fileAt(name + suffix);
    if (f.exists) f.delete();
  }
}

/**
 * One-time move of a database created before encryption: export into an encrypted copy,
 * verify it, then swap the files. Kill-safe — every interrupted state is completed or
 * rolled back on the next start, and the plaintext copy is removed once the swap is done.
 */
async function encryptLegacyDatabase(key: string) {
  const dir = SQLite.defaultDatabaseDirectory;
  const isPlain = async () => fileAt(DB_NAME).exists && (await OneScanVision!.isPlainSqliteAsync!(`${dir}/${DB_NAME}`));
  const verified = fileAt(ENC_OK).exists && fileAt(ENC_NAME).exists;

  // Interrupted swap: the verified encrypted copy becomes the database.
  if (verified && (!fileAt(DB_NAME).exists || (await isPlain()))) swapIn();
  if (fileAt(ENC_OK).exists) fileAt(ENC_OK).delete();
  remove(BAK_NAME);

  if (!(await isPlain())) {
    remove(ENC_NAME);
    return;
  }

  // Plaintext database from an earlier version: export, verify, swap.
  remove(ENC_NAME);
  const plain = await SQLite.openDatabaseAsync(DB_NAME);
  let counts: number[] = [];
  try {
    await plain.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    const version = (await plain.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    counts = await tableCounts(plain);
    await plain.execAsync(
      `ATTACH DATABASE '${dir}/${ENC_NAME}' AS enc KEY "x'${key}'";` +
        `SELECT sqlcipher_export('enc');` +
        `PRAGMA enc.user_version = ${version};` +
        `DETACH DATABASE enc;`,
    );
  } finally {
    await plain.closeAsync();
  }
  const enc = await SQLite.openDatabaseAsync(ENC_NAME);
  try {
    await enc.execAsync(`PRAGMA key = "x'${key}'";`);
    const check = await tableCounts(enc);
    if (check.join(',') !== counts.join(',')) throw new Error('Encrypted database check failed');
  } finally {
    await enc.closeAsync();
  }
  fileAt(ENC_OK).create();
  swapIn();
  fileAt(ENC_OK).delete();
  remove(BAK_NAME);
}

/** Plain database aside (removed afterwards), verified encrypted copy into its place. */
function swapIn() {
  remove(BAK_NAME);
  if (fileAt(DB_NAME).exists) fileAt(DB_NAME).move(fileAt(BAK_NAME));
  remove(DB_NAME);
  fileAt(ENC_NAME).move(fileAt(DB_NAME));
}

async function tableCounts(db: Database): Promise<number[]> {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name",
  );
  const out: number[] = [];
  for (const t of tables) {
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`);
    out.push(r?.n ?? 0);
  }
  return out;
}
