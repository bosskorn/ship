import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import { CaptureEngine } from './capture/CaptureEngine';
import { ImageEngine } from './image/ImageEngine';
import { OCREngine } from './ocr/OCREngine';
import { PDFEngine } from './pdf/PDFEngine';
import { RedactionEngine } from './redaction/RedactionEngine';
import { ExportEngine } from './export/ExportEngine';
import { DocumentFileStore } from './storage/DocumentFileStore';
import { newId } from './ids';
import { OneScanVision } from '@/native/OneScanVision';
import type { DocumentRecord, DocumentType, DraftPage, PageFilter, Quad, Rotation, SystemFolderKey } from './model';

export type SaveStage = 'pages' | 'pdf' | 'ocr' | 'index';
type StageCallback = (s: SaveStage, progress: number) => void;

/** OCR languages: Thailand-first with English, per the regional pack (spec §51). */
const OCR_LANGUAGES = ['th', 'en'];

const folderForType: Partial<Record<DocumentType, SystemFolderKey>> = {
  receipt: 'receipts',
  invoice: 'invoices',
  contract: 'contracts',
  business_card: 'business_cards',
  id_card: 'personal',
};

interface StoredPage {
  uri: string;
  width: number;
  height: number;
  filter: PageFilter;
  rotation: Rotation;
}

/**
 * Facade over the engine modules. Screens call this; they never touch
 * capture/image/OCR/PDF internals directly (spec §43). No method here
 * performs network I/O.
 */
export const DocumentEngine = {
  capture: CaptureEngine,
  image: ImageEngine,
  ocr: OCREngine,
  pdf: PDFEngine,
  redaction: RedactionEngine,
  export: ExportEngine,

  /** Capture → detect edges → perspective correction → enhance (spec §13). */
  async processCapture(sourceUri: string, filter: PageFilter = 'auto'): Promise<DraftPage> {
    const det = await CaptureEngine.detect(sourceUri);
    const quad = det.detected ? det.quad : null;
    const out = await ImageEngine.process(sourceUri, { quad, filter, rotation: 0 });
    return { id: newId(), sourceUri, processedUri: out.uri, width: out.width, height: out.height, quad: quad ?? undefined, filter, rotation: 0 };
  },

  /** Page from the system scanner: already cropped and perspective-corrected, so only enhance. */
  async processScanned(uri: string, filter: PageFilter = 'auto'): Promise<DraftPage> {
    const out = await ImageEngine.process(uri, { quad: null, filter, rotation: 0 });
    return { id: newId(), sourceUri: uri, processedUri: out.uri, width: out.width, height: out.height, filter, rotation: 0 };
  },

  /** Re-run processing from the original capture (filter, rotation or manual crop changed). */
  async reprocess(page: DraftPage, patch: { filter?: PageFilter; rotation?: Rotation; quad?: Quad | null }): Promise<DraftPage> {
    const next: DraftPage = {
      ...page,
      ...(patch.filter ? { filter: patch.filter } : {}),
      ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
      ...(patch.quad !== undefined ? { quad: patch.quad ?? undefined } : {}),
    };
    const out = await ImageEngine.process(page.sourceUri, { quad: next.quad ?? null, filter: next.filter, rotation: next.rotation });
    return { ...next, processedUri: out.uri, width: out.width, height: out.height };
  },

  /** Upright, uncropped copy of the original capture for the crop editor (EXIF applied). */
  async uprightPreview(page: DraftPage): Promise<{ uri: string; width: number; height: number }> {
    if (!OneScanVision) throw new Error('No native vision');
    return OneScanVision.processPageAsync(page.sourceUri, null, 'original', 0);
  },

  /** Build PDF, thumbnail and OCR index from stored page images (page by page). */
  async finalize(
    docId: string,
    pages: StoredPage[],
    title: string,
    onStage?: StageCallback,
  ): Promise<{ pdfUri: string; thumbUri: string; sizeBytes: number; ocrText: string; hasSensitive: boolean }> {
    onStage?.('pdf', 0);
    const filterApplied = CaptureEngine.hasNativeVision();
    const pdf = await PDFEngine.create(pages.map((p) => ({ ...p, filterApplied })), title);
    const pdfFile = DocumentFileStore.adopt(pdf.uri, docId, 'document.pdf');
    const thumbFile = DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].uri), docId, 'thumb.jpg');

    onStage?.('ocr', 0);
    const ocr = await OCREngine.recognize(pages.map((p) => p.uri), OCR_LANGUAGES, (d, t) => onStage?.('ocr', d / t));
    return {
      pdfUri: pdfFile.uri,
      thumbUri: thumbFile.uri,
      sizeBytes: DocumentFileStore.size(pdfFile.uri),
      ocrText: ocr.text,
      hasSensitive: ocr.available && RedactionEngine.detect(ocr.text).length > 0,
    };
  },

  async save(draft: DraftPage[], opts: { title: string; docType: DocumentType; onStage?: StageCallback }): Promise<DocumentRecord> {
    if (!draft.length) throw new Error('Cannot save an empty document');
    // Files are written under `docId`; the DB rows reference these URIs.
    const docId = newId();
    opts.onStage?.('pages', 0);
    const pages: StoredPage[] = draft.map((p, i) => ({
      uri: DocumentFileStore.adopt(p.processedUri, docId, `page-${i + 1}.jpg`).uri,
      width: p.width,
      height: p.height,
      filter: p.filter,
      rotation: p.rotation,
    }));
    const out = await this.finalize(docId, pages, opts.title, opts.onStage);
    opts.onStage?.('index', 1);
    const folderKey = folderForType[opts.docType];
    return documentRepository.create({
      title: opts.title,
      docType: opts.docType,
      folderId: folderKey ? await folderRepository.bySystemKey(folderKey) : null,
      pdfUri: out.pdfUri,
      thumbnailUri: out.thumbUri,
      sizeBytes: out.sizeBytes,
      ocrText: out.ocrText,
      hasSensitive: out.hasSensitive,
      pages: pages.map((p, i) => ({ pageIndex: i, imageUri: p.uri, width: p.width, height: p.height, filter: p.filter, rotation: p.rotation })),
    });
  },

  /** Load a saved document's pages as editable drafts. */
  async draftsFor(docId: string): Promise<DraftPage[]> {
    const pages = await documentRepository.pages(docId);
    return pages.map((p) => ({
      id: newId(),
      sourceUri: p.imageUri,
      processedUri: p.imageUri,
      width: p.width,
      height: p.height,
      // Saved pages are already processed; further edits start from them.
      filter: 'original' as const,
      rotation: 0 as const,
    }));
  },

  /** Save edits back into an existing document (new files; old files removed). */
  async saveEdits(doc: DocumentRecord, draft: DraftPage[], onStage?: StageCallback): Promise<DocumentRecord> {
    if (!draft.length) throw new Error('Cannot save an empty document');
    const fileId = newId();
    onStage?.('pages', 0);
    const pages: StoredPage[] = draft.map((p, i) => ({
      uri: DocumentFileStore.adopt(p.processedUri, fileId, `page-${i + 1}.jpg`).uri,
      width: p.width,
      height: p.height,
      filter: p.filter,
      rotation: p.rotation,
    }));
    const out = await this.finalize(fileId, pages, doc.title, onStage);
    onStage?.('index', 1);
    await documentRepository.replaceContent(doc.id, {
      pdfUri: out.pdfUri,
      thumbnailUri: out.thumbUri,
      sizeBytes: out.sizeBytes,
      ocrText: out.ocrText,
      hasSensitive: out.hasSensitive,
      pages: pages.map((p, i) => ({ pageIndex: i, imageUri: p.uri, width: p.width, height: p.height, filter: p.filter, rotation: p.rotation })),
    });
    const oldDir = doc.pdfUri?.match(/docs\/([^/]+)\//)?.[1];
    if (oldDir && oldDir !== fileId) DocumentFileStore.deleteDocument(oldDir);
    return (await documentRepository.get(doc.id))!;
  },

  /**
   * Import an existing PDF (copied into the sandbox; never uploaded). With the
   * native module, pages are rasterised for viewing, OCR and search.
   */
  async importPdf(uri: string, name: string, onStage?: StageCallback): Promise<DocumentRecord> {
    const docId = newId();
    const pdfFile = DocumentFileStore.adopt(uri, docId, 'document.pdf');
    const title = name.replace(/\.pdf$/i, '');
    if (!OneScanVision) {
      return documentRepository.create({
        title, docType: 'document', pdfUri: pdfFile.uri, thumbnailUri: null,
        sizeBytes: DocumentFileStore.size(pdfFile.uri), pages: [], pageCount: 0,
      });
    }
    onStage?.('pages', 0);
    const rendered = await OneScanVision.renderPdfAsync(pdfFile.uri, 1654);
    const pages = rendered.pages.map((p, i) => ({
      uri: DocumentFileStore.adopt(p.uri, docId, `page-${i + 1}.jpg`).uri,
      width: p.width,
      height: p.height,
    }));
    const thumbUri = pages.length ? DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].uri), docId, 'thumb.jpg').uri : null;
    onStage?.('ocr', 0);
    const ocr = await OCREngine.recognize(pages.map((p) => p.uri), OCR_LANGUAGES, (d, t) => onStage?.('ocr', d / t));
    return documentRepository.create({
      title,
      docType: 'document',
      pdfUri: pdfFile.uri,
      thumbnailUri: thumbUri,
      sizeBytes: DocumentFileStore.size(pdfFile.uri),
      ocrText: ocr.text,
      hasSensitive: ocr.available && RedactionEngine.detect(ocr.text).length > 0,
      pages: pages.map((p, i) => ({ pageIndex: i, imageUri: p.uri, width: p.width, height: p.height, filter: 'original' as const, rotation: 0 as const })),
      pageCount: pages.length,
    });
  },

  async duplicate(doc: DocumentRecord, title: string): Promise<DocumentRecord> {
    const docId = newId();
    const pages = await documentRepository.pages(doc.id);
    const copy = (uri: string | null, name: string) => (uri ? DocumentFileStore.adopt(uri, docId, name).uri : null);
    return documentRepository.create({
      title,
      docType: doc.docType,
      folderId: doc.folderId,
      pdfUri: copy(doc.pdfUri, 'document.pdf')!,
      thumbnailUri: copy(doc.thumbnailUri, 'thumb.jpg'),
      sizeBytes: doc.sizeBytes,
      ocrText: await documentRepository.ocrText(doc.id),
      hasSensitive: doc.hasSensitive,
      pages: pages.map((p, i) => ({ ...p, imageUri: copy(p.imageUri, `page-${i + 1}.jpg`)! })),
      pageCount: doc.pageCount,
    });
  },

  /**
   * Redacted copy, entirely on device (spec §18, §66.3): re-OCR each page for
   * text positions, black out PII regions, build a new PDF. The original
   * document is not modified.
   */
  async createRedactedCopy(doc: DocumentRecord, title: string, onStage?: StageCallback): Promise<DocumentRecord> {
    if (!OneScanVision) throw new Error('Redaction requires on-device vision');
    const source = await documentRepository.pages(doc.id);
    const docId = newId();
    const pages: StoredPage[] = [];
    const texts: string[] = [];
    for (let i = 0; i < source.length; i++) {
      onStage?.('pages', i / source.length);
      const blocks = await OneScanVision.recognizeTextAsync(source[i].imageUri, OCR_LANGUAGES);
      const text = blocks.map((b) => b.text).join('\n');
      const matches = RedactionEngine.detect(text);
      const boxes = RedactionEngine.blocksToRedact(blocks, matches);
      const out = boxes.length ? (await OneScanVision.redactRegionsAsync(source[i].imageUri, boxes)).uri : source[i].imageUri;
      pages.push({
        uri: DocumentFileStore.adopt(out, docId, `page-${i + 1}.jpg`).uri,
        width: source[i].width,
        height: source[i].height,
        filter: source[i].filter,
        rotation: source[i].rotation,
      });
      texts.push(RedactionEngine.redactText(text, matches));
    }
    const filterApplied = true;
    onStage?.('pdf', 0);
    const pdf = await PDFEngine.create(pages.map((p) => ({ ...p, filterApplied })), title);
    const pdfFile = DocumentFileStore.adopt(pdf.uri, docId, 'document.pdf');
    const thumb = DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].uri), docId, 'thumb.jpg');
    onStage?.('index', 1);
    return documentRepository.create({
      title,
      docType: doc.docType,
      folderId: doc.folderId,
      pdfUri: pdfFile.uri,
      thumbnailUri: thumb.uri,
      sizeBytes: DocumentFileStore.size(pdfFile.uri),
      ocrText: texts.join('\n\n'),
      hasSensitive: false,
      isRedactedCopy: true,
      sourceDocumentId: doc.id,
      pages: pages.map((p, i) => ({ pageIndex: i, imageUri: p.uri, width: p.width, height: p.height, filter: p.filter, rotation: p.rotation })),
    });
  },

  async share(doc: DocumentRecord) {
    if (!doc.pdfUri) return;
    await ExportEngine.sharePdf(doc.pdfUri, doc.title);
  },

  async moveToTrash(id: string) {
    await documentRepository.trash(id);
  },

  /** Permanent delete: DB rows + all local files. Cloud deletion is requested separately by SyncEngine. */
  async deletePermanently(doc: DocumentRecord) {
    await documentRepository.purge(doc.id);
    const dir = doc.pdfUri?.match(/docs\/([^/]+)\//)?.[1];
    if (dir) DocumentFileStore.deleteDocument(dir);
  },

  async emptyExpiredTrash(retentionDays: number) {
    for (const doc of await documentRepository.expiredTrash(retentionDays)) {
      await this.deletePermanently(doc);
    }
  },
};
