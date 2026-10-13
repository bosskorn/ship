import { freeDiskBytes } from './maintenance';

/** Below this, saving a scan is refused up front (a 20-page MAX scan needs a few hundred MB). */
export const MIN_FREE_BYTES_SAVE = 250 * 1024 * 1024;
/** Below this, the scanner warns before capturing. */
export const MIN_FREE_BYTES_CAPTURE = 100 * 1024 * 1024;

/** True when the device is known to be nearly full (unknown free space never blocks). */
export function lowDisk(minBytes: number): boolean {
  const free = freeDiskBytes();
  return free !== null && free < minBytes;
}

/** An error that means the disk is full (native or JS file APIs). */
export function isDiskFull(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /ENOSPC|No space left|disk full|not enough space|insufficient storage/i.test(m);
}
