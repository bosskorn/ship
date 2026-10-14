import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { SecurityEngine } from './SecurityEngine';

/**
 * AES-256-GCM, on device. Output is IV‖ciphertext‖tag — the only form in
 * which a document may leave the device for OneScan Cloud (spec §27, §59).
 */
export async function encryptForVault(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await AESEncryptionKey.import(await SecurityEngine.getOrCreateVaultKey());
  const sealed = await aesEncryptAsync(plaintext, key);
  return sealed.combined('bytes');
}

export async function decryptFromVault(combined: Uint8Array): Promise<Uint8Array> {
  const key = await AESEncryptionKey.import(await SecurityEngine.getOrCreateVaultKey());
  return aesDecryptAsync(AESSealedData.fromCombined(combined), key);
}
