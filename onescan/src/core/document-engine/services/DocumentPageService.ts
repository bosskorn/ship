import { File, Paths } from 'expo-file-system';
import { DocumentEngine, PDF_RENDER_WIDTH, StageCallback } from '../DocumentEngine';
import { CancelSignal, OperationCancelled, throwIfCancelled } from '../cancel';
import { ImageEngine } from '../image/ImageEngine';
import { defaultFilterFor } from '../image/filters';
import { PREVIEW, ScanQuality } from '../image/quality';
import { newId } from '../ids';
import type { DocumentRecord, DocumentType, DraftPage } from '../model';
import { MAX_DOCUMENT_PAGES, PageItem, PageLimitError, turn } from '../pages/pageOps';
import { OneScanVision } from '@/native/OneScanVision';

export { PageLimitError };

/** Image types Images → PDF accepts: the ones the on-device pipeline is tested with. */
export const IMPORT_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export type LoadProgress = (done: number, total: number) => void;
export interface LoadOptions {
  onProgress?: LoadProgress;
  signal?: CancelSignal;
}

const item = (page: DraftPage, sourceDocumentId?: string): PageItem => ({ key: newId(), page, previewRotation: page.rotation, sourceDocumentId });

/** Working files the page tools create live in the app cache; document files never do. */
function isTemp(uri: string | undefined): uri is string {
  return !!uri && uri.startsWith(Paths.cache.uri) && !uri.includes('/onescan/docs/');
}

/**
 * Pages for the page tools (Page Manager, Images → PDF, Merge, Split, PDF → Images). Loads pages
 * from documents, photos or PDF files as editable drafts, and builds documents from them through
 * the existing save path (render masters → PDF → OCR → index, encrypted at rest). Sources are only
 * read: a tool that makes a new document never changes the documents it took pages from.
 *
 * Long loads work one page at a time, report real page counts and stop between pages when
 * cancelled; whatever they had written is removed.
 */
export const DocumentPageService = {
  /** A saved document's pages (from the originals when kept, like Edit). Reads rows only. */
  async fromDocument(doc: Pick<DocumentRecord, 'id'>): Promise<PageItem[]> {
    return (await DocumentEngine.draftsFor(doc.id)).map((p) => item(p, doc.id));
  },

  /**
   * Photos as they are (no edge detection, no enhancement): Images → PDF. Only JPEG and PNG are
   * taken (read from the file header, no decode); others are reported as `skipped`.
   */
  async fromImages(uris: string[], opts: LoadOptions = {}): Promise<{ items: PageItem[]; skipped: number }> {
    const items: PageItem[] = [];
    let skipped = 0;
    try {
      for (let i = 0; i < uris.length; i++) {
        throwIfCancelled(opts.signal);
        const info = await ImageEngine.info(uris[i]);
        if (info && IMPORT_IMAGE_TYPES.includes(info.mimeType)) items.push(item(await DocumentEngine.processScanned(uris[i], 'original')));
        else skipped++;
        opts.onProgress?.(i + 1, uris.length);
      }
      return { items, skipped };
    } catch (e) {
      this.discard(items);
      throw e;
    }
  },

  /** A new capture added to a document: detected, cropped and enhanced like a scan. */
  async fromCapture(uri: string, docType: DocumentType): Promise<PageItem> {
    return item(await DocumentEngine.processCapture(uri, defaultFilterFor(docType)));
  },

  /** Pages in a PDF file (no rendering). */
  async pdfPageCount(uri: string): Promise<number | null> {
    return OneScanVision?.pdfPageCountAsync ? OneScanVision.pdfPageCountAsync(uri) : null;
  },

  /**
   * Pages of a PDF file on the device, rendered on device one page at a time (only one page
   * bitmap in memory; each render is written to the cache and its preview made before the
   * next). More than `limit` pages is refused before anything is rendered.
   */
  async fromPdfFile(uri: string, opts: LoadOptions & { limit?: number } = {}): Promise<PageItem[]> {
    if (!OneScanVision) throw new Error('PDF pages need on-device rendering');
    const limit = opts.limit ?? MAX_DOCUMENT_PAGES;
    const out: PageItem[] = [];
    const add = async (p: { uri: string }) => {
      const preview = await ImageEngine.resize(p.uri, PREVIEW);
      out.push(item({ id: newId(), sourceUri: p.uri, processedUri: preview.uri, width: preview.width, height: preview.height, filter: 'original', rotation: 0 }));
    };
    try {
      const count = await this.pdfPageCount(uri);
      if (count !== null && OneScanVision.renderPdfPagesAsync) {
        if (count > limit) throw new PageLimitError(limit);
        for (let i = 0; i < count; i++) {
          throwIfCancelled(opts.signal);
          const r = await OneScanVision.renderPdfPagesAsync(uri, PDF_RENDER_WIDTH, i, 1);
          for (const p of r.pages) await add(p);
          opts.onProgress?.(i + 1, count);
        }
      } else {
        // Older native build: one call renders every page (still one bitmap at a time).
        const rendered = await OneScanVision.renderPdfAsync(uri, PDF_RENDER_WIDTH);
        if (rendered.pages.length > limit) {
          this.discardFiles(rendered.pages.map((p) => p.uri));
          throw new PageLimitError(limit);
        }
        for (let i = 0; i < rendered.pages.length; i++) {
          throwIfCancelled(opts.signal);
          await add(rendered.pages[i]);
          opts.onProgress?.(i + 1, rendered.pages.length);
        }
      }
      return out;
    } catch (e) {
      this.discard(out);
      throw e;
    }
  },

  /**
   * Removes the working files (renders, previews, picked photos) behind these pages. Files of
   * saved documents are never touched. Call when a tool is done with its pages.
   */
  discard(items: PageItem[]) {
    this.discardFiles(items.flatMap((it) => [it.page.sourceUri, it.page.processedUri]));
  },

  discardFiles(uris: (string | undefined)[]) {
    for (const uri of new Set(uris)) {
      if (!isTemp(uri)) continue;
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // already gone; stale cache files are also removed at start-up
      }
    }
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
  async prepare(items: PageItem[], signal?: CancelSignal): Promise<DraftPage[]> {
    const out: DraftPage[] = [];
    for (let i = 0; i < items.length; i++) {
      throwIfCancelled(signal);
      const it = items[i];
      out.push(it.page.rotation === it.previewRotation ? it.page : await DocumentEngine.reprocess(it.page, { rotation: it.page.rotation }));
    }
    return out;
  },

  /** A new document from the pages (the sources are not modified). */
  async saveAsNew(
    items: PageItem[],
    opts: { title: string; docType: DocumentType; quality?: ScanQuality; onStage?: StageCallback; signal?: CancelSignal },
  ): Promise<DocumentRecord> {
    if (!items.length) throw new Error('Cannot save an empty document');
    if (items.length > MAX_DOCUMENT_PAGES) throw new PageLimitError(MAX_DOCUMENT_PAGES);
    const drafts = await this.prepare(items, opts.signal);
    return DocumentEngine.save(drafts, { title: opts.title, docType: opts.docType, quality: opts.quality, onStage: opts.onStage, signal: opts.signal });
  },

  /**
   * Several new documents in one go (Split): all of them or none. If one fails or the user
   * cancels, the documents already made by this call are deleted again (rows and files), so no
   * partial output is left. The source is only read.
   */
  async saveParts(
    parts: { items: PageItem[]; title: string }[],
    opts: { docType: DocumentType; quality?: ScanQuality; signal?: CancelSignal; onPart?: (done: number, total: number) => void; onStage?: StageCallback },
  ): Promise<DocumentRecord[]> {
    const made: DocumentRecord[] = [];
    try {
      for (let k = 0; k < parts.length; k++) {
        throwIfCancelled(opts.signal);
        opts.onPart?.(k, parts.length);
        made.push(await this.saveAsNew(parts[k].items, { title: parts[k].title, docType: opts.docType, quality: opts.quality, signal: opts.signal, onStage: opts.onStage }));
      }
      opts.onPart?.(parts.length, parts.length);
      return made;
    } catch (e) {
      for (const doc of made) {
        try {
          await DocumentEngine.deletePermanently(doc);
        } catch {
          // its folder is swept at start-up if the row is gone
        }
      }
      throw e;
    }
  },

  /** Replace a document's pages (Page Manager on a document: reorder, rotate, add, remove). */
  async saveInto(doc: DocumentRecord, items: PageItem[], opts: { quality?: ScanQuality; onStage?: StageCallback; signal?: CancelSignal } = {}): Promise<DocumentRecord> {
    if (!items.length) throw new Error('Cannot save an empty document');
    if (items.length > MAX_DOCUMENT_PAGES) throw new PageLimitError(MAX_DOCUMENT_PAGES);
    const drafts = await this.prepare(items, opts.signal);
    return DocumentEngine.saveEdits(doc, drafts, opts.onStage, opts.quality, opts.signal);
  },
};

export { OperationCancelled };
