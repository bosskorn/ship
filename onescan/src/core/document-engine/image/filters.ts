import type { PageFilter } from '../model';

/**
 * CSS filter equivalents, used when rendering pages into the PDF if the native
 * module did not already bake the filter into pixels. Keeps output consistent
 * with the user's choice on every platform.
 */
export const cssFilterFor: Record<PageFilter, string> = {
  original: 'none',
  auto: 'contrast(1.15) brightness(1.04) saturate(1.05)',
  document: 'grayscale(0.2) contrast(1.35) brightness(1.08)',
  color: 'contrast(1.1) saturate(1.3)',
  gray: 'grayscale(1) contrast(1.1)',
  bw: 'grayscale(1) contrast(2.2) brightness(1.15)',
};

export const pageFilters: PageFilter[] = ['original', 'auto', 'document', 'color', 'gray', 'bw'];
