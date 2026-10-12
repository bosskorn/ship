/** Engine-level domain model. UI-agnostic so the engine can ship as an SDK. */

export type DocumentType =
  | 'document'
  | 'id_card'
  | 'receipt'
  | 'invoice'
  | 'contract'
  | 'book'
  | 'whiteboard'
  | 'business_card';

export type CaptureMode = 'document' | 'id' | 'book' | 'whiteboard';

/**
 * `auto` = "Scan" (white paper, dark text: documents, receipts); `card` = colour scan for
 * ID cards, passports and other cards (white balance, even lighting, never black-and-white).
 */
export type PageFilter = 'original' | 'auto' | 'card' | 'document' | 'color' | 'gray' | 'bw';

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

/** Normalised (0..1) quadrilateral: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface DraftPage {
  id: string;
  /** Original capture (scanner/camera JPEG, never re-encoded). Masters are rendered from it. */
  sourceUri: string;
  /**
   * Fast preview render (≈1600 px) for the editor. The full-resolution master is
   * rendered once, from `sourceUri` + edit parameters, when the document is saved.
   */
  processedUri: string;
  /** Preview size (same aspect as the master). */
  width: number;
  height: number;
  quad?: Quad;
  filter: PageFilter;
  rotation: Rotation;
}

export type SyncState = 'local_only' | 'pending_upload' | 'synced' | 'pending_delete';

export interface DocumentRecord {
  id: string;
  title: string;
  docType: DocumentType;
  folderId: string | null;
  pageCount: number;
  sizeBytes: number;
  pdfUri: string | null;
  thumbnailUri: string | null;
  hasSensitive: boolean;
  isRedactedCopy: boolean;
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  deletedAt: number | null;
  syncState: SyncState;
}

export interface PageRecord {
  id: string;
  documentId: string;
  pageIndex: number;
  /** Master image (full resolution): viewer zoom, PDF, export, share, print. */
  imageUri: string;
  /** Master size in px. */
  width: number;
  height: number;
  filter: PageFilter;
  rotation: Rotation;
  /** Original capture (pages saved before 1.0.5 have none). */
  sourceUri?: string | null;
  /** ≈1600 px copy for fast on-screen display. */
  previewUri?: string | null;
  /** Crop applied to the original. */
  quad?: Quad | null;
}

export interface FolderRecord {
  id: string;
  name: string;
  systemKey: SystemFolderKey | null;
  createdAt: number;
  itemCount: number;
}

export const systemFolderKeys = [
  'personal',
  'work',
  'education',
  'receipts',
  'invoices',
  'contracts',
  'business_cards',
] as const;
export type SystemFolderKey = (typeof systemFolderKeys)[number];
