import type { PageFilter, Rotation } from '../model';
import { cssFilterFor } from '../image/filters';

export interface PdfPageInput {
  /** data: URI (base64) of the processed page image. */
  dataUri: string;
  width: number;
  height: number;
  filter: PageFilter;
  /** Informational: already applied to the image pixels. */
  rotation: Rotation;
  /** Whether `filter` is already baked into pixels. */
  filterApplied: boolean;
}

/** A4 at 72dpi (PDF points). */
export const A4 = { width: 595, height: 842 } as const;

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * One image per page, fitted to A4 preserving aspect ratio.
 * Pure function so layout is unit-testable without a device.
 */
export function buildPdfHtml(pages: PdfPageInput[], title: string): string {
  const body = pages
    .map((p) => {
      // Rotation is always baked into pixels by ImageEngine; only the filter may need CSS.
      const filter = p.filterApplied ? 'none' : cssFilterFor[p.filter];
      return `<section class="page"><img src="${escapeAttr(p.dataUri)}" style="filter:${filter};" /></section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeAttr(title)}</title>
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
.page { width: ${A4.width}pt; height: ${A4.height}pt; display: flex; align-items: center; justify-content: center; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.page img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style></head><body>${body}</body></html>`;
}
