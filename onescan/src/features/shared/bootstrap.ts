import { folderRepository } from '@/core/database/repositories/documentRepository';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { useRemoteConfig } from '@/core/config/remoteConfig';
import { useDocuments } from '@/features/documents/documentsStore';
import { clearReadableUris } from '@/features/shared/SecureImage';
import { cleanCache, encryptExistingFiles, sweepOrphanFolders } from '@/core/document-engine/storage/maintenance';

let started = false;

/** One-time local setup: system folders, trash retention, initial list load. */
export async function bootstrapLocalData() {
  if (started) return;
  started = true;
  await cleanCache();
  try {
    await folderRepository.ensureSystemFolders();
    await DocumentEngine.emptyExpiredTrash(useRemoteConfig.getState().config.trashRetentionDays);
  } catch {
    // Storage unavailable (e.g. web preview) — screens show empty states.
  }
  await useDocuments.getState().refresh();
  // Background upkeep after the list is on screen: never blocks the user.
  void (async () => {
    try {
      await sweepOrphanFolders();
      const r = await encryptExistingFiles();
      if (r.encrypted > 0) {
        // Paths resolved to themselves while still plaintext now point at ciphertext.
        clearReadableUris();
        await useDocuments.getState().refresh();
      }
    } catch {
      // retried on the next start
    }
  })();
}
