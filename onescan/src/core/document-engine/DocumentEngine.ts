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
import { defaultScanQuality, masterProfiles, masterSize, PREVIEW, ScanQuality, THUMBNAIL } from './image/quality';
import { toStage, useScanDiagnostics } from './image/diagnostics';
import type { ProcessedImage } from './image/ImageEngine';
import type { DocumentRecord, DocumentType, DraftPage, PageFilter, PageRecord, Quad, Rotation, SystemFolderKey } from './model';

export type SaveStage = 'pages' | 'pdf' | 'ocr' | 'index';
type StageCallback = (s: SaveStage, progress: number) => void;

/** PDF import raster width: A4 at 300 dpi. */
const PDF_RENDER_WIDTH = 2480;

/** OCR languages: Thailand-first with English, per the regional pack (spec §51). */
const OCR_LANGUAGES = ['th', 'en'];

const folderForType: Partial<Record<DocumentType, SystemFolderKey>> = {
  receipt: 'receipts',
  invoice: 'invoices',
  contract: 'contracts',
  business_card: 'business_cards',
  id_card: 'personal',
};

/** A filed page: `uri` is the full-resolution master. */
interface StoredPage {
  uri: string;
  sourceUri: string | null;
  previewUri: string | null;
  width: number;
  height: number;
  filter: PageFilter;
  rotation: Rotation;
  quad: Quad | null;
}

const toPageRow = (p: StoredPage, i: number): Omit<PageRecord, 'id' | 'documentId'> => ({
  pageIndex: i,
  imageUri: p.uri,
  width: p.width,
  height: p.height,
  filter: p.filter,
  rotation: p.rotation,
  sourceUri: p.sourceUri,
  previewUri: p.previewUri,
  quad: p.quad,
});

/** Camera facts for diagnostics (numbers only). */
export interface CaptureMeta {
  engine?: string;
  tier?: string;
  jpegQuality?: number;
  captureMs?: number;
}

/** Diagnostics for a freshly captured page: original vs. its preview render. */
async function recordDraft(
  sourceUri: string,
  preview: ProcessedImage,
  scanner: 'system' | 'camera',
  filter: PageFilter,
  meta?: CaptureMeta & { processMs?: number },
) {
  const [src, prev] = await Promise.all([ImageEngine.info(sourceUri), ImageEngine.info(preview.uri)]);
  useScanDiagnostics.getState().record({
    page: 0,
    scanner,
    filter,
    profile: 'preview',
    stages: { source: toStage(src), preview: toStage(prev, { quality: preview.quality }) },
    ...(meta ? { capture: { engine: meta.engine, tier: meta.tier, jpegQuality: meta.jpegQuality }, timings: { captureMs: meta.captureMs, processMs: meta.processMs } } : {}),
  });
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

  /** Capture → detect edges → preview render (the master is rendered on save, spec §13). */
  async processCapture(sourceUri: string, filter: PageFilter = 'auto', meta?: CaptureMeta): Promise<DraftPage> {
    const started = Date.now();
    const det = await CaptureEngine.detect(sourceUri);
    const quad = det.detected ? det.quad : null;
    const out = await ImageEngine.preview(sourceUri, { quad, filter, rotation: 0 });
    await recordDraft(sourceUri, out, 'camera', filter, meta ? { ...meta, processMs: Date.now() - started } : undefined);
    return { id: newId(), sourceUri, processedUri: out.uri, width: out.width, height: out.height, quad: quad ?? undefined, filter, rotation: 0 };
  },

  /** Page from the system scanner: already cropped and perspective-corrected, so only enhance. */
  async processScanned(uri: string, filter: PageFilter = 'auto'): Promise<DraftPage> {
    const started = Date.now();
    const out = await ImageEngine.preview(uri, { quad: null, filter, rotation: 0 });
    await recordDraft(uri, out, 'system', filter, { engine: 'system', processMs: Date.now() - started });
    return { id: newId(), sourceUri: uri, processedUri: out.uri, width: out.width, height: out.height, filter, rotation: 0 };
  },

  /** New preview from the original capture (filter, rotation or manual crop changed). */
  async reprocess(page: DraftPage, patch: { filter?: PageFilter; rotation?: Rotation; quad?: Quad | null }): Promise<DraftPage> {
    const next: DraftPage = {
      ...page,
      ...(patch.filter ? { filter: patch.filter } : {}),
      ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
      ...(patch.quad !== undefined ? { quad: patch.quad ?? undefined } : {}),
    };
    const out = await ImageEngine.preview(page.sourceUri, { quad: next.quad ?? null, filter: next.filter, rotation: next.rotation });
    return { ...next, processedUri: out.uri, width: out.width, height: out.height };
  },

  /** Upright, uncropped preview of the original capture for the crop editor (EXIF applied). */
  async uprightPreview(page: DraftPage): Promise<{ uri: string; width: number; height: number }> {
    if (!OneScanVision) throw new Error('No native vision');
    return OneScanVision.processPageAsync(page.sourceUri, null, 'original', 0, PREVIEW);
  },

  /**
   * Render each page's master once from its original (decode once → crop/rotate/filter →
   * encode once at the quality setting) and file all tiers under `docId`.
   */
  async renderPages(draft: DraftPage[], docId: string, tier: ScanQuality, onStage?: StageCallback): Promise<StoredPage[]> {
    const pages: StoredPage[] = [];
    for (let i = 0; i < draft.length; i++) {
      onStage?.('pages', i / draft.length);
      const p = draft[i];
      const pageTier = p.quality ?? tier;
      const profile = masterProfiles[pageTier];
      const n = i + 1;
      const params = { quad: p.quad ?? null, filter: p.filter, rotation: p.rotation };
      const sourceInfo = await ImageEngine.info(p.sourceUri);
      // "Original" with no crop/rotation: the master *is* the scanner's JPEG (no re-encode).
      const untouched =
        !params.quad && params.rotation === 0 && p.filter === 'original' && sourceInfo !== null &&
        sourceInfo.mimeType === 'image/jpeg' && sourceInfo.orientation === 0 &&
        masterSize(sourceInfo, profile).width === sourceInfo.width;
      const master = untouched
        ? { uri: p.sourceUri, width: sourceInfo!.width, height: sourceInfo!.height, quality: undefined, degraded: false }
        : await ImageEngine.process(p.sourceUri, params, profile);
      const stored: StoredPage = {
        uri: DocumentFileStore.adopt(master.uri, docId, `processed/page-${n}.jpg`).uri,
        sourceUri: DocumentFileStore.adopt(p.sourceUri, docId, `original/page-${n}.jpg`).uri,
        previewUri: DocumentFileStore.adopt(p.processedUri, docId, `preview/page-${n}.jpg`).uri,
        width: master.width,
        height: master.height,
        filter: p.filter,
        rotation: p.rotation,
        quad: p.quad ?? null,
      };
      pages.push(stored);
      const [mInfo, pInfo] = await Promise.all([ImageEngine.info(stored.uri), ImageEngine.info(stored.previewUri!)]);
      useScanDiagnostics.getState().record({
        page: n,
        filter: p.filter,
        profile: pageTier,
        stages: {
          source: toStage(sourceInfo),
          master: toStage(mInfo, { quality: master.quality, degraded: master.degraded }),
          preview: toStage(pInfo, { quality: PREVIEW.quality }),
        },
      });
    }
    return pages;
  },

  /** Build PDF (from masters), thumbnail (from a preview) and OCR index, page by page. */
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
    const thumbFile = DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].previewUri ?? pages[0].uri), docId, 'thumbnail/thumb.jpg');
    useScanDiagnostics.getState().attach(1, 'thumbnail', toStage(await ImageEngine.info(thumbFile.uri), { quality: THUMBNAIL.quality }));

    onStage?.('ocr', 0);
    // OCR decodes its own working copy natively; coordinates are normalised to the master.
    const ocr = await OCREngine.recognize(pages.map((p) => p.uri), OCR_LANGUAGES, (d, t) => onStage?.('ocr', d / t));
    return {
      pdfUri: pdfFile.uri,
      thumbUri: thumbFile.uri,
      sizeBytes: pages.reduce((n, p) => n + DocumentFileStore.size(p.uri), 0) + DocumentFileStore.size(pdfFile.uri),
      ocrText: ocr.text,
      hasSensitive: ocr.available && RedactionEngine.detect(ocr.text).length > 0,
    };
  },

  async save(
    draft: DraftPage[],
    opts: { title: string; docType: DocumentType; quality?: ScanQuality; onStage?: StageCallback },
  ): Promise<DocumentRecord> {
    if (!draft.length) throw new Error('Cannot save an empty document');
    // Files are written under `docId`; the DB rows reference these URIs.
    const docId = newId();
    const pages = await this.renderPages(draft, docId, opts.quality ?? defaultScanQuality, opts.onStage);
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
      pages: pages.map(toPageRow),
    });
  },

  /** Load a saved document's pages as editable drafts (from the originals when kept). */
  async draftsFor(docId: string): Promise<DraftPage[]> {
    const pages = await documentRepository.pages(docId);
    return pages.map((p) =>
      p.sourceUri
        ? {
            id: newId(),
            sourceUri: p.sourceUri,
            processedUri: p.previewUri ?? p.imageUri,
            width: p.width,
            height: p.height,
            quad: p.quad ?? undefined,
            filter: p.filter,
            rotation: p.rotation,
          }
        : {
            // Saved before 1.0.5: only the processed page exists; edits start from it.
            id: newId(),
            sourceUri: p.imageUri,
            processedUri: p.imageUri,
            width: p.width,
            height: p.height,
            filter: 'original' as const,
            rotation: 0 as const,
          },
    );
  },

  /** Save edits back into an existing document (new files; old files removed). */
  async saveEdits(doc: DocumentRecord, draft: DraftPage[], onStage?: StageCallback, quality: ScanQuality = defaultScanQuality): Promise<DocumentRecord> {
    if (!draft.length) throw new Error('Cannot save an empty document');
    const fileId = newId();
    const pages = await this.renderPages(draft, fileId, quality, onStage);
    const out = await this.finalize(fileId, pages, doc.title, onStage);
    onStage?.('index', 1);
    await documentRepository.replaceContent(doc.id, {
      pdfUri: out.pdfUri,
      thumbnailUri: out.thumbUri,
      sizeBytes: out.sizeBytes,
      ocrText: out.ocrText,
      hasSensitive: out.hasSensitive,
      pages: pages.map(toPageRow),
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
    // 2480 px wide ≈ A4 at 300 dpi; each rendered page is that page's master.
    const rendered = await OneScanVision.renderPdfAsync(pdfFile.uri, PDF_RENDER_WIDTH);
    const pages: StoredPage[] = [];
    for (let i = 0; i < rendered.pages.length; i++) {
      const p = rendered.pages[i];
      const master = DocumentFileStore.adopt(p.uri, docId, `processed/page-${i + 1}.jpg`).uri;
      const preview = await ImageEngine.resize(master, PREVIEW);
      pages.push({
        uri: master,
        sourceUri: master,
        previewUri: DocumentFileStore.adopt(preview.uri, docId, `preview/page-${i + 1}.jpg`).uri,
        width: p.width,
        height: p.height,
        filter: 'original',
        rotation: 0,
        quad: null,
      });
    }
    const thumbUri = pages.length ? DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].previewUri!), docId, 'thumbnail/thumb.jpg').uri : null;
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
      pages: pages.map(toPageRow),
      pageCount: pages.length,
    });
  },

  async duplicate(doc: DocumentRecord, title: string): Promise<DocumentRecord> {
    const docId = newId();
    const pages = await documentRepository.pages(doc.id);
    const copy = (uri: string | null | undefined, name: string) => (uri ? DocumentFileStore.adopt(uri, docId, name).uri : null);
    return documentRepository.create({
      title,
      docType: doc.docType,
      folderId: doc.folderId,
      pdfUri: copy(doc.pdfUri, 'document.pdf')!,
      thumbnailUri: copy(doc.thumbnailUri, 'thumbnail/thumb.jpg'),
      sizeBytes: doc.sizeBytes,
      ocrText: await documentRepository.ocrText(doc.id),
      hasSensitive: doc.hasSensitive,
      pages: pages.map((p, i) => ({
        ...p,
        imageUri: copy(p.imageUri, `processed/page-${i + 1}.jpg`)!,
        sourceUri: copy(p.sourceUri, `original/page-${i + 1}.jpg`),
        previewUri: copy(p.previewUri, `preview/page-${i + 1}.jpg`),
      })),
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
      const master = DocumentFileStore.adopt(out, docId, `processed/page-${i + 1}.jpg`).uri;
      const preview = await ImageEngine.resize(master, PREVIEW);
      pages.push({
        uri: master,
        // The redacted master is this copy's original: unredacted pixels must not be kept.
        sourceUri: master,
        previewUri: DocumentFileStore.adopt(preview.uri, docId, `preview/page-${i + 1}.jpg`).uri,
        width: source[i].width,
        height: source[i].height,
        filter: 'original',
        rotation: 0,
        quad: null,
      });
      texts.push(RedactionEngine.redactText(text, matches));
    }
    const filterApplied = true;
    onStage?.('pdf', 0);
    const pdf = await PDFEngine.create(pages.map((p) => ({ ...p, filterApplied })), title);
    const pdfFile = DocumentFileStore.adopt(pdf.uri, docId, 'document.pdf');
    const thumb = DocumentFileStore.adopt(await ImageEngine.thumbnail(pages[0].previewUri ?? pages[0].uri), docId, 'thumbnail/thumb.jpg');
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
      pages: pages.map(toPageRow),
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
