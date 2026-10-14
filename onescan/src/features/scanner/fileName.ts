/** Default name for a new scan, e.g. `OneScan_2026-10-14_14-30`: sortable, safe as a PDF file name. */
export const DEFAULT_FILE_PREFIX = 'OneScan';
export const MAX_FILE_PREFIX = 40;

/** Removes characters that are not allowed in file names on Android / Windows / macOS. */
export function cleanFilePrefix(prefix: string): string {
  // eslint-disable-next-line no-control-regex
  return prefix.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FILE_PREFIX);
}

export function scanFileName(prefix: string, at: number = Date.now()): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const time = `${p(d.getHours())}-${p(d.getMinutes())}`;
  return `${cleanFilePrefix(prefix) || DEFAULT_FILE_PREFIX}_${date}_${time}`;
}
