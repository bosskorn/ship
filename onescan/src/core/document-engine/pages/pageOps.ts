import type { DraftPage, Rotation } from '../model';

/**
 * Page-list operations shared by every page tool (Page Manager, Images → PDF, Merge, Split)
 * and the scan Review. Pure: they return new arrays and never touch files.
 */

/** Pages in a document built by the page tools (the PDF writer embeds JPEGs as they are). */
export const MAX_DOCUMENT_PAGES = 100;

/** More pages than a tool output may have; refused before any work. */
export class PageLimitError extends Error {
  constructor(readonly limit: number) {
    super('page_limit');
  }
}

/** A page in a page tool: the draft plus where it came from and what its preview shows. */
export interface PageItem {
  /** Stable key for lists and drag. */
  key: string;
  page: DraftPage;
  /** Rotation already baked into `page.processedUri`; a different `page.rotation` means stale preview. */
  previewRotation: Rotation;
  /** Document the page came from (merge/split labels), if any. */
  sourceDocumentId?: string;
}

export function movePage<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [p] = next.splice(from, 1);
  next.splice(to, 0, p);
  return next;
}

export function removeAt<T>(list: readonly T[], indexes: Iterable<number>): T[] {
  const drop = new Set(indexes);
  return list.filter((_, i) => !drop.has(i));
}

/** Copy of the page at `index`, inserted right after it (new identity, same content). */
export function duplicateAt<T>(list: readonly T[], index: number, copy: (item: T) => T): T[] {
  if (index < 0 || index >= list.length) return [...list];
  const next = [...list];
  next.splice(index + 1, 0, copy(list[index]));
  return next;
}

export function insertAt<T>(list: readonly T[], at: number, items: readonly T[]): T[] {
  const i = Math.max(0, Math.min(at, list.length));
  return [...list.slice(0, i), ...items, ...list.slice(i)];
}

/** Rotation after turning by ±90° (clockwise positive). */
export function turn(rotation: Rotation, delta: 90 | -90): Rotation {
  return (((rotation + delta) % 360) + 360) % 360 as Rotation;
}

/** How far the preview must be turned on screen to show the page's current rotation. */
export function displayTurn(item: PageItem): number {
  return (((item.page.rotation - item.previewRotation) % 360) + 360) % 360;
}

/** Room left before the page limit. */
export const roomFor = (count: number) => Math.max(0, MAX_DOCUMENT_PAGES - count);

export type RangeError = 'empty' | 'syntax' | 'out_of_range' | 'reversed' | 'overlap';

/**
 * Page ranges as typed by a person: "1-3, 7-10", "5", "2–4" (any dash), 1-based, inclusive.
 * Returns the ranges in the given order (0-based), or why they are not valid.
 */
export function parseRanges(input: string, pageCount: number): { ranges: [number, number][] } | { error: RangeError } {
  const parts = input
    // "1 - 3" is one range: drop spaces around the dash before splitting on separators.
    .replace(/\s*([-–—~])\s*/g, '$1')
    .split(/[,،、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { error: 'empty' };
  const ranges: [number, number][] = [];
  for (const part of parts) {
    const m = /^(\d{1,4})(?:[-–—~](\d{1,4}))?$/.exec(part);
    if (!m) return { error: 'syntax' };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) return { error: 'out_of_range' };
    if (b < a) return { error: 'reversed' };
    ranges.push([a - 1, b - 1]);
  }
  // A page in two ranges ("1-3, 2-4" or "2, 2") would be output twice: refused.
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][0] <= sorted[i - 1][1]) return { error: 'overlap' };
  return { ranges };
}

/** Page indexes (0-based) covered by ranges, in the order typed. */
export function pagesInRanges(ranges: [number, number][]): number[] {
  return ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
}

/** Grid slot under a point (container coordinates), clamped to the list. */
export function slotAt(x: number, y: number, cell: { width: number; height: number }, columns: number, count: number): number {
  if (count <= 0) return 0;
  const col = Math.max(0, Math.min(columns - 1, Math.floor(x / cell.width)));
  const row = Math.max(0, Math.floor(y / cell.height));
  return Math.max(0, Math.min(count - 1, row * columns + col));
}

/** "1-3,7" for pages 1,2,3,7 (1-based, sorted). */
export function compactPages(pageNumbers: number[]): string {
  const n = [...new Set(pageNumbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    parts.push(i === j ? `${n[i]}` : `${n[i]}-${n[j]}`);
    i = j;
  }
  return parts.join(',');
}
