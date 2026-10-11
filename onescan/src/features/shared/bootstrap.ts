import { folderRepository } from '@/core/database/repositories/documentRepository';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { useRemoteConfig } from '@/core/config/remoteConfig';
import { useDocuments } from '@/features/documents/documentsStore';

let started = false;

/** One-time local setup: system folders, trash retention, initial list load. */
export async function bootstrapLocalData() {
  if (started) return;
  started = true;
  try {
    await folderRepository.ensureSystemFolders();
    await DocumentEngine.emptyExpiredTrash(useRemoteConfig.getState().config.trashRetentionDays);
  } catch {
    // Storage unavailable (e.g. web preview) — screens show empty states.
  }
  await useDocuments.getState().refresh();
}
