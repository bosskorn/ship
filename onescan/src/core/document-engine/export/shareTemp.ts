import { OneScanVision } from '@/native/OneScanVision';

/**
 * Plaintext share copies (`cache/onescan/share/<created>-<uuid>/<name>`, Android).
 *
 * A receiving app can read the shared file after the share sheet has closed (a mail app on
 * send, a background upload), so a copy is never deleted right after sharing. Copies older
 * than SHARE_COPY_MIN_AGE_MS are removed: before and after each share, when the app returns
 * to the foreground, and at start. The age is a safeguard, not the only cleanup path.
 *
 * PROVISIONAL: 15 minutes, to be confirmed by real-device QA with LINE, Gmail, Google Drive and
 * Files (Owner decision; not a final value).
 */
export const SHARE_COPY_MIN_AGE_MS = 15 * 60 * 1000;

/** A share-only copy of `uri`, or null when the native module cannot make one (iOS / web). */
export async function shareCopyUri(uri: string, name: string): Promise<string | null> {
  if (!OneScanVision?.shareCopyAsync) return null;
  return OneScanVision.shareCopyAsync(uri, name);
}

/** Removes share copies at least `minAgeMs` old. Best effort: never throws. */
export async function sweepShareCopies(minAgeMs = SHARE_COPY_MIN_AGE_MS): Promise<number> {
  try {
    return (await OneScanVision?.sweepShareCopiesAsync?.(minAgeMs)) ?? 0;
  } catch {
    return 0;
  }
}
