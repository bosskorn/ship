import { randomUUID } from 'expo-crypto';
import { appMeta } from './appMeta';

const KEY = 'installation_id';
let cached: string | null = null;

/**
 * Random id of this installation (UUIDv4), created the first time it is needed — never on the
 * startup path. Not a hardware id; a reinstall gets a new one. Used only to recognise this
 * device in the user's device list after sign-in.
 */
export async function installationId(): Promise<string> {
  if (cached) return cached;
  cached = (await appMeta.get(KEY)) ?? (await appMeta.setIfAbsent(KEY, randomUUID()));
  return cached;
}
