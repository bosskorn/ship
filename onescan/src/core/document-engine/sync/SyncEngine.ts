import { canUpload, CloudObjectMeta, CloudSettings, UploadIntent } from './syncPolicy';
import { encryptForVault } from '../security/vaultCrypto';

export * from './syncPolicy';

/** Provider adapter (OneScan R2, Google Drive, OneDrive, Dropbox, WebDAV). */
export interface CloudProviderAdapter {
  id: string;
  putEncrypted(objectId: string, bytes: Uint8Array): Promise<CloudObjectMeta>;
  delete(objectId: string): Promise<void>;
}

export class SyncDeniedError extends Error {}

export const SyncEngine = {
  /**
   * Encrypt on device, then upload the encrypted blob. Plaintext never reaches
   * the adapter. Ships in V1.3; adapters are not registered in V1.0.
   */
  async upload(
    adapter: CloudProviderAdapter,
    objectId: string,
    plaintext: Uint8Array,
    cloud: CloudSettings,
    autoUpload: boolean,
    intent: Omit<UploadIntent, 'encrypted'>,
  ): Promise<CloudObjectMeta> {
    const pre = canUpload(cloud, autoUpload, { ...intent, encrypted: true });
    if (!pre.allowed) throw new SyncDeniedError(pre.reason);
    const blob = await encryptForVault(plaintext);
    return adapter.putEncrypted(objectId, blob);
  },
};
