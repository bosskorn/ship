import { DocumentEngine, PDF_RENDER_WIDTH, StageCallback } from '../DocumentEngine';
import { ImageEngine } from '../image/ImageEngine';
import { defaultFilterFor } from '../image/filters';
import { PREVIEW, ScanQuality } from '../image/quality';
import { newId } from '../ids';
import type { DocumentRecord, DocumentType, DraftPage } from '../model';
import { MAX_DOCUMENT_PAGES, PageItem, turn } from '../pages/pageOps';
import { OneScanVision } from '@/native/OneScanVision';

export class PageLimitError extends Error {
  constructor(readonly limit: number) {
    super('page_limit');
  }
}

const item = (page: DraftPage, sourceDocumentId?: string): PageItem => ({ key: newId(), page, previewRotation: page.rotation, sourceDocumentId });

/**
 * Pages for the page tools (Page Manager, Images → PDF, Merge, Split, PDF → Images). Loads pages
 * from documents, photos or PDF files as editable drafts, and builds documents from them through
 * the existing save path (render masters → PDF → OCR → index). Sources are only read: a tool
 * that makes a new document never changes the documents it took pages from.
 */
export const DocumentPageService = {
  /** A saved document's pages (from the originals when kept, like Edit). */
  async fromDocument(doc: Pick<DocumentRecord, 'id'>): Promise<PageItem[]> {
    return (await DocumentEngine.draftsFor(doc.id)).map((p) => item(p, doc.id));
  },

  /** Photos as they are (no edge detection, no enhancement): Images → PDF. */
  async fromImages(uris: string[], onProgress?: (done: number, total: number) => void): Promise<PageItem[]> {
    const out: PageItem[] = [];
    for (let i = 0; i < uris.length; i++) {
      out.push(item(await DocumentEngine.processScanned(uris[i], 'original')));
      onProgress?.(i + 1, uris.length);
    }
    return out;
  },

  /** A new capture added to a document: detected, cropped and enhanced like a scan. */
  async fromCapture(uri: string, docType: DocumentType): Promise<PageItem> {
    return item(await DocumentEngine.processCapture(uri, defaultFilterFor(docType)));
  },

  /** Pages of a PDF file on the device, rendered on device. */
  async fromPdfFile(uri: string, onProgress?: (done: number, total: number) => void): Promise<PageItem[]> {
    if (!OneScanVision) throw new Error('PDF pages need on-device rendering');
    const rendered = await OneScanVision.renderPdfAsync(uri, PDF_RENDER_WIDTH);
    const out: PageItem[] = [];
    for (let i = 0; i < rendered.pages.length; i++) {
      const p = rendered.pages[i];
      const preview = await ImageEngine.resize(p.uri, PREVIEW);
      out.push(item({ id: newId(), sourceUri: p.uri, processedUri: preview.uri, width: preview.width, height: preview.height, filter: 'original', rotation: 0 }));
      onProgress?.(i + 1, rendered.pages.length);
    }
    return out;
  },

  /** Same content, new identity (duplicate a page). */
  copy(it: PageItem): PageItem {
    return { ...it, key: newId(), page: { ...it.page, id: newId() } };
  },

  rotate(it: PageItem, delta: 90 | -90): PageItem {
    return { ...it, page: { ...it.page, rotation: turn(it.page.rotation, delta) } };
  },

  /** New crop for one page (re-renders its preview from the original). */
  async crop(it: PageItem, quad: NonNullable<DraftPage['quad']>): Promise<PageItem> {
    const page = await DocumentEngine.reprocess(it.page, { quad });
    return { ...it, page, previewRotation: page.rotation };
  },

  /** Previews that no longer match their rotation are re-rendered before saving. */
  async prepare(items: PageItem[], onProgress?: (done: number, total: number) => void): Promise<DraftPage[]> {
    const out: DraftPage[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      out.push(it.page.rotation === it.previewRotation ? it.page : await DocumentEngine.reprocess(it.page, { rotation: it.page.rotation }));
      onProgress?.(i + 1, items.length);
    }
    return out;
  },

  /** A new document from the pages (the sources are not modified). */
  async saveAsNew(items: PageItem[], opts: { title: string; docType: DocumentType; quality?: ScanQuality; onStage?: StageCallback }): Promise<DocumentRecord> {
    if (!items.length) throw new Error('Cannot save an empty document');
    if (items.length > MAX_DOCUMENT_PAGES) throw new PageLimitError(MAX_DOCUMENT_PAGES);
    const drafts = await this.prepare(items);
    return DocumentEngine.save(drafts, { title: opts.title, docType: opts.docType, quality: opts.quality, onStage: opts.onStage });
  },

  /** Replace a document's pages (Page Manager on a document: reorder, rotate, add, remove). */
  async saveInto(doc: DocumentRecord, items: PageItem[], opts: { quality?: ScanQuality; onStage?: StageCallback } = {}): Promise<DocumentRecord> {
    if (!items.length) throw new Error('Cannot save an empty document');
    if (items.length > MAX_DOCUMENT_PAGES) throw new PageLimitError(MAX_DOCUMENT_PAGES);
    const drafts = await this.prepare(items);
    return DocumentEngine.saveEdits(doc, drafts, opts.onStage, opts.quality);
  },
};
