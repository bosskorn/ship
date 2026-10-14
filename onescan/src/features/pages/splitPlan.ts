import { compactPages, parseRanges, RangeError } from '@/core/document-engine/pages/pageOps';

export type SplitMode = 'all' | 'select' | 'ranges';

/** One output document: its pages (0-based, in order) and a name derived from the source. */
export interface SplitPart {
  pages: number[];
  title: string;
}

/**
 * What a split will create, before anything is written:
 *  all    — one document per page
 *  select — one document with the selected pages (extract)
 *  ranges — one document per typed range ("1-3, 7-10")
 */
export function planSplit(mode: SplitMode, opts: { title: string; pageCount: number; selected?: number[]; ranges?: string }): { parts: SplitPart[] } | { error: RangeError | 'select_some' } {
  const name = (pages: number[]) => `${opts.title}_p${compactPages(pages.map((p) => p + 1))}`;
  if (mode === 'all') {
    return { parts: Array.from({ length: opts.pageCount }, (_, i) => ({ pages: [i], title: name([i]) })) };
  }
  if (mode === 'select') {
    const pages = [...new Set(opts.selected ?? [])].sort((a, b) => a - b);
    if (!pages.length) return { error: 'select_some' };
    return { parts: [{ pages, title: name(pages) }] };
  }
  const parsed = parseRanges(opts.ranges ?? '', opts.pageCount);
  if ('error' in parsed) return parsed;
  return {
    parts: parsed.ranges.map(([a, b]) => {
      const pages = Array.from({ length: b - a + 1 }, (_, i) => a + i);
      return { pages, title: name(pages) };
    }),
  };
}
