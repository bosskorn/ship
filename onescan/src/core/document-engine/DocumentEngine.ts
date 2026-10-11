import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import { CaptureEngine } from './capture/CaptureEngine';
import { ImageEngine } from './image/ImageEngine';
import { OCREngine } from './ocr/OCREngine';
import { PDFEngine } from './pdf/PDFEngine';
import { RedactionEngine } from './redaction/RedactionEngine';
import { ExportEngine } from './export/ExportEngine';
import { DocumentFileStore } from './storage/DocumentFileStore';
import { newId } from './ids';
import type { DocumentRecord, DocumentType, DraftPage, PageFilter, Rotation, SystemFolderKey } from './model';

export type SaveStage = 'pdf' | 'ocr' | 'index';

const folderForType: Partial<Record<DocumentType, SystemFolderKey>> = {
  receipt: 'receipts',
  invoice: 'invoices',
  contract: 'contracts',
  business_card: 'business_cards',
  id_card: 'personal',
};

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

  /** Capture → detect → perspective/enhance, producing a draft page. */
  async processCapture(sourceUri: string, filter: PageFilter = 'auto'): Promise<DraftPage> {
    const det = await CaptureEngine.detect(sourceUri);
    const quad = det.detected ? det.quad : null;
    const out = await ImageEngine.process(sourceUri, { quad, filter, rotation: 0 });
    return { id: newId(), sourceUri, processedUri: out.uri, width: out.width, height: out.height, quad: quad ?? undefined, filter, rotation: 0 };
  },

  /** Re-run processing after the user changes filter/rotation in the editor. */
  async reprocess(page: DraftPage, patch: { filter?: PageFilter; rotation?: Rotation }): Promise<DraftPage> {
    const next = { ...page, ...patch };
    const out = await ImageEngine.process(page.sourceUri, { quad: page.quad ?? null, filter: next.filter, rotation: next.rotation });
    return { ...next, processedUri: out.uri, width: out.width, height: out.height };
  },

  async save(
    draft: DraftPage[],
    opts: { title: string; docType: DocumentType; onStage?: (s: SaveStage, progress: number) => void },
  ): Promise<DocumentRecord> {
    if (!draft.length) throw new Error('Cannot save an empty document');
    const stagingId = newId();
    const filterApplied = CaptureEngine.hasNativeDetection();

    opts.onStage?.('pdf', 0);
    const pages = draft.map((p, i) => {
      const f = DocumentFileStore.adopt(p.processedUri, stagingId, `page-${i + 1}.jpg`);
      return { uri: f.uri, width: p.width, height: p.height, filter: p.filter, rotation: p.rotation };
    });
    const pdf = await PDFEngine.create(pages.map((p) => ({ ...p, filterApplied })), opts.title);
    const pdfFile = DocumentFileStore.adopt(pdf.uri, stagingId, 'document.pdf');
    const thumbUri = await ImageEngine.thumbnail(pages[0].uri);
    const thumbFile = DocumentFileStore.adopt(thumbUri, stagingId, 'thumb.jpg');

    opts.onStage?.('ocr', 0);
    const ocr = await OCREngine.recognize(pages.map((p) => p.uri), undefined, (d, t) => opts.onStage?.('ocr', d / t));
    const sensitive = ocr.available ? RedactionEngine.detect(ocr.text).length > 0 : false;

    opts.onStage?.('index', 1);
    const folderKey = folderForType[opts.docType];
    const folderId = folderKey ? await folderRepository.bySystemKey(folderKey) : null;
    const record = await documentRepository.create({
      title: opts.title,
      docType: opts.docType,
      folderId,
      pdfUri: pdfFile.uri,
      thumbnailUri: thumbFile.uri,
      sizeBytes: DocumentFileStore.size(pdfFile.uri),
      ocrText: ocr.text,
      hasSensitive: sensitive,
      pages: pages.map((p, i) => ({ pageIndex: i, imageUri: p.uri, width: p.width, height: p.height, filter: p.filter, rotation: p.rotation as Rotation })),
    });
    // Files were staged under `stagingId`; DB rows reference those URIs directly,
    // so the staging dir simply becomes the document's permanent folder.
    return record;
  },

  /** Import an existing PDF (copied into the sandbox; never uploaded). */
  async importPdf(uri: string, name: string): Promise<DocumentRecord> {
    const stagingId = newId();
    const file = DocumentFileStore.adopt(uri, stagingId, 'document.pdf');
    return documentRepository.create({
      title: name.replace(/\.pdf$/i, ''),
      docType: 'document',
      pdfUri: file.uri,
      thumbnailUri: null,
      sizeBytes: DocumentFileStore.size(file.uri),
      pages: [],
      pageCount: 0,
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
