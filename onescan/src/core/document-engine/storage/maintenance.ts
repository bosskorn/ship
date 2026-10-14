import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getDatabase } from '@/core/database/db';
import { OneScanVision } from '@/native/OneScanVision';

/**
 * Start-up storage upkeep (all on device):
 *  - decrypted copies and stale capture/render files in the cache are removed;
 *  - document folders no database row refers to (a save cut short) are removed;
 *  - documents saved before encryption are encrypted in place, file by file. Each file is
 *    verified and swapped atomically and already-encrypted files are skipped, so an
 *    interrupted pass simply continues on the next start.
 */

/** Cache files younger than this may belong to a scan that is starting right now. */
const CACHE_MIN_AGE_MS = 10 * 60 * 1000;
/** A folder this young may be a save in progress. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const docsRoot = () => new Directory(Paths.document, 'onescan', 'docs');

function ageMs(entry: File | Directory): number {
  try {
    const t = entry instanceof File ? entry.modificationTime : entry.info().modificationTime;
    return t ? Date.now() - t : 0;
  } catch {
    return 0;
  }
}

/** Decrypted copies (`plain/`) always; other cached captures and renders once stale. */
export async function cleanCache() {
  if (Platform.OS === 'web') return;
  try {
    await OneScanVision?.clearPlainCacheAsync?.();
  } catch {
    // best effort
  }
  try {
    const root = new Directory(Paths.cache, 'onescan');
    if (!root.exists) return;
    for (const e of root.list()) {
      try {
        if (e instanceof Directory && e.name === 'plain') continue;
        if (ageMs(e) > CACHE_MIN_AGE_MS) e.delete();
      } catch {
        // in use or already gone
      }
    }
  } catch {
    // best effort
  }
}

/** Folder names (`docs/<name>/…`) referenced by any document or page. */
async function referencedFolders(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ u: string | null }>(
    `SELECT pdf_uri AS u FROM documents UNION ALL SELECT thumbnail_uri FROM documents
     UNION ALL SELECT image_uri FROM pages UNION ALL SELECT source_uri FROM pages UNION ALL SELECT preview_uri FROM pages`,
  );
  const out = new Set<string>();
  for (const r of rows) {
    const m = r.u?.match(/\/docs\/([^/]+)\//);
    if (m) out.add(m[1]);
  }
  return out;
}

export async function sweepOrphanFolders(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    const root = docsRoot();
    if (!root.exists) return 0;
    const used = await referencedFolders();
    let removed = 0;
    for (const e of root.list()) {
      if (!(e instanceof Directory) || used.has(e.name) || ageMs(e) < ORPHAN_MIN_AGE_MS) continue;
      try {
        e.delete();
        removed++;
      } catch {
        // retry next start
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

function* filesUnder(dir: Directory): Generator<File> {
  for (const e of dir.list()) {
    if (e instanceof Directory) yield* filesUnder(e);
    else yield e as File;
  }
}

/** Encrypt documents stored before encryption existed. Returns files encrypted this run. */
export async function encryptExistingFiles(): Promise<{ encrypted: number; failed: number }> {
  if (Platform.OS === 'web') return { encrypted: 0, failed: 0 };
  try {
    const root = docsRoot();
    const migrate = OneScanVision?.migrateFileAsync;
    if (!root.exists || !migrate) return { encrypted: 0, failed: 0 };
    let encrypted = 0;
    let failed = 0;
    for (const f of filesUnder(root)) {
      // Leftovers of an interrupted write/migration: the real file is still intact.
      if (/\.(enc|dec|mig)\.tmp$/.test(f.name)) {
        try {
          f.delete();
        } catch {
          // ignore
        }
        continue;
      }
      try {
        if (await migrate(f.uri)) encrypted++;
      } catch {
        failed++; // left as is (still readable); retried next start
      }
    }
    return { encrypted, failed };
  } catch {
    return { encrypted: 0, failed: 0 };
  }
}

/** Bytes free on the device's data partition (null when unknown). */
export function freeDiskBytes(): number | null {
  if (Platform.OS === 'web') return null;
  try {
    const n = Paths.availableDiskSpace;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
