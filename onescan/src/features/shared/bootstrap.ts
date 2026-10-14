import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { useRemoteConfig } from '@/core/config/remoteConfig';
import { useDocuments } from '@/features/documents/documentsStore';
import { clearReadableUris } from '@/features/shared/SecureImage';
import { cleanCache, encryptExistingFiles, sweepOrphanFolders } from '@/core/document-engine/storage/maintenance';

let started = false;

/**
 * Local setup (local-first): document list loads immediately on frame 1.
 * Maintenance (cache sweep, trash expiration, encryption) runs asynchronously
 * in the background so it never blocks the launch frame or navigation.
 */
export async function bootstrapLocalData() {
  if (started) return;
  started = true;

  // 1. First priority: load local documents into memory immediately.
  const loadDocs = useDocuments.getState().refresh();

  // 2. Background upkeep: never blocks the user from seeing the UI.
  void (async () => {
    try {
      await cleanCache();
    } catch {
      // cache cleanup unavailable
    }
    try {
      await DocumentEngine.emptyExpiredTrash(useRemoteConfig.getState().config.trashRetentionDays);
    } catch {
      // Storage unavailable
    }
    try {
      await sweepOrphanFolders();
      const r = await encryptExistingFiles();
      if (r.encrypted > 0) {
        clearReadableUris();
        await useDocuments.getState().refresh();
      }
    } catch {
      // retried on the next start
    }
  })();

  await loadDocs;
}
