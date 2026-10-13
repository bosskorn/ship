import { requireOptionalNativeModule } from 'expo';
import type { PageFilter, Quad } from '@/core/document-engine/model';

/**
 * Binding for the local Expo module `modules/onescan-vision`:
 *  - iOS: AVFoundation camera, Core Image, Vision OCR, PDFKit
 *  - Android: CameraX, Bitmap pipeline, ML Kit + Tesseract (Thai) OCR, PdfRenderer
 *
 * `null` when the module is not in the binary (Expo Go, web) — engines then
 * fall back gracefully. Nothing in this interface performs network I/O.
 */
export interface NativeOcrBlock {
  text: string;
  /** Normalised bounding box, top-left origin. */
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface ImageInfo {
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  /** EXIF rotation in degrees. */
  orientation: number;
}

export interface NativeImage {
  uri: string;
  width: number;
  height: number;
}

/** A camera still (`takePhoto`): sensor capture, never a preview frame. */
export interface CapturedPhoto extends NativeImage {
  /** JPEG quality the camera encoded at. */
  quality?: number;
  bytes?: number;
  /** Shutter → file written. */
  captureMs?: number;
}

export interface OneScanVisionModule {
  /**
   * Upright full-range BT.601 planes, long edge ≤ maxEdge, base64: `data` = Y,
   * `cb`/`cr` = chroma (128 neutral). With `withMask`, also `mask`: 64×64 page
   * probabilities (0..255) from the on-device DocSeg model (absent if unavailable).
   */
  grayscaleAsync(
    imageUri: string,
    maxEdge: number,
    withMask?: boolean,
  ): Promise<{ width: number; height: number; data: string; cb?: string; cr?: string; mask?: string }>;
  /** Same planes (+ page mask) for one normalised region of the upright photo, at `maxEdge` px. */
  grayscaleRegionAsync?(
    imageUri: string,
    region: { x: number; y: number; width: number; height: number },
    maxEdge: number,
    withMask?: boolean,
  ): Promise<{ width: number; height: number; data: string; cb?: string; cr?: string; mask?: string }>;
  /**
   * System document scanner (Android: ML Kit Document Scanner via Play services;
   * iOS: VisionKit). Edge detection, auto capture and perspective correction run on
   * the device. Resolves with cropped page images (empty when the user cancels);
   * rejects with `E_SCANNER_UNAVAILABLE` when the device has no system scanner.
   */
  scanDocumentsAsync(pageLimit: number, allowGallery: boolean): Promise<{ pages: NativeImage[] }>;
  /**
   * Perspective-correct `quad`, rotate, enhance, filter — decoded once at full resolution
   * (unless `maxEdge` > 0 asks for less; never upscales) and encoded once at `quality`.
   * Writes a new file; the source is untouched. `degraded` = memory forced a smaller size.
   */
  processPageAsync(
    imageUri: string,
    quad: Quad | null,
    filter: PageFilter,
    rotation: number,
    options?: { maxEdge: number; quality: number },
  ): Promise<NativeImage & { bytes?: number; quality?: number; degraded?: boolean }>;
  /** Smaller copy (preview / thumbnail); never used as a master. */
  resizeAsync(imageUri: string, maxEdge: number, quality: number): Promise<NativeImage & { bytes: number }>;
  /** Upright pixel size, file size, type and EXIF rotation — without decoding pixels. */
  imageInfoAsync(imageUri: string): Promise<ImageInfo>;
  /** PDF embedding each page JPEG unchanged (A4, fitted); pages streamed from disk. */
  writePdfAsync(pageUris: string[]): Promise<{ uri: string; pageCount: number; bytes: number }>;
  recognizeTextAsync(imageUri: string, languages: string[]): Promise<NativeOcrBlock[]>;
  /** Draws opaque boxes over regions; writes a new file (original untouched). */
  redactRegionsAsync(imageUri: string, boxes: NativeOcrBlock['box'][]): Promise<{ uri: string }>;
  /** Rasterise each PDF page (one at a time) to JPEG. */
  renderPdfAsync(pdfUri: string, maxWidth: number): Promise<{ pages: NativeImage[] }>;
}

export const OneScanVision = requireOptionalNativeModule<OneScanVisionModule>('OneScanVision');
