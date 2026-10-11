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

export interface NativeImage {
  uri: string;
  width: number;
  height: number;
}

export interface OneScanVisionModule {
  /** Upright 8-bit luminance, long edge ≤ maxEdge, base64. Feeds the JS quad detector. */
  grayscaleAsync(imageUri: string, maxEdge: number): Promise<{ width: number; height: number; data: string }>;
  /** Perspective-correct `quad`, rotate, enhance, filter. Writes a new file; source untouched. */
  processPageAsync(imageUri: string, quad: Quad | null, filter: PageFilter, rotation: number): Promise<NativeImage>;
  recognizeTextAsync(imageUri: string, languages: string[]): Promise<NativeOcrBlock[]>;
  /** Draws opaque boxes over regions; writes a new file (original untouched). */
  redactRegionsAsync(imageUri: string, boxes: NativeOcrBlock['box'][]): Promise<{ uri: string }>;
  /** Rasterise each PDF page (one at a time) to JPEG. */
  renderPdfAsync(pdfUri: string, maxWidth: number): Promise<{ pages: NativeImage[] }>;
}

export const OneScanVision = requireOptionalNativeModule<OneScanVisionModule>('OneScanVision');
