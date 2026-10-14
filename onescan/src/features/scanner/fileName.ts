/** Default name for a new scan, e.g. `OneScan_2026-10-14_14-30`: sortable, safe as a PDF file name. */
export const DEFAULT_FILE_PREFIX = 'OneScan';
export const MAX_FILE_PREFIX = 40;
/** Merge PDF output, e.g. `Merged_2026-10-15_14-30`. */
export const MERGED_PREFIX = 'Merged';

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

/**
 * `base` if unused, else `base_2`, `base_3`, … Several scans in the same minute get distinct
 * names. (Files never collide either way: they are stored and shared per document id.)
 */
export function uniqueTitle(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export async function nextScanTitle(prefix: string, titlesLike: (base: string) => Promise<string[]>, at: number = Date.now()): Promise<string> {
  const base = scanFileName(prefix, at);
  return uniqueTitle(base, await titlesLike(base).catch(() => []));
}
