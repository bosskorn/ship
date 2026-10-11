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

export type PageFilter = 'original' | 'auto' | 'document' | 'color' | 'gray' | 'bw';

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

/** Normalised (0..1) quadrilateral: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface DraftPage {
  id: string;
  /** Original capture, kept for re-processing. Local file URI. */
  sourceUri: string;
  /** Processed output (perspective-corrected, enhanced). */
  processedUri: string;
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
  imageUri: string;
  width: number;
  height: number;
  filter: PageFilter;
  rotation: Rotation;
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
