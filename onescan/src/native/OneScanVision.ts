import { requireOptionalNativeModule } from 'expo';
import type { PageFilter, Quad } from '@/core/document-engine/model';

/**
 * Contract for the on-device vision module (spec §42):
 *  - iOS: Vision (VNDetectRectanglesRequest, VNRecognizeTextRequest) + Core Image
 *  - Android: ML Kit text recognition + native/OpenCV edge detection
 *
 * Implemented as a local Expo module (`modules/onescan-vision`, not yet built).
 * Until it ships, `OneScanVision` is `null` and engines fall back gracefully.
 * Nothing in this interface may perform network I/O.
 */
export interface NativeDetection {
  quad: Quad | null;
  confidence: number; // 0..1
  brightness: number; // 0..1 mean luminance
  sharpness: number; // 0..1 (variance of Laplacian, normalised)
}

export interface NativeOcrBlock {
  text: string;
  /** Normalised bounding box. */
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface OneScanVisionModule {
  detectDocumentAsync(imageUri: string): Promise<NativeDetection>;
  /** Perspective-correct `quad`, then apply `filter`. Returns new file URI + size. */
  processPageAsync(
    imageUri: string,
    quad: Quad | null,
    filter: PageFilter,
    rotation: number,
  ): Promise<{ uri: string; width: number; height: number }>;
  recognizeTextAsync(imageUri: string, languages: string[]): Promise<NativeOcrBlock[]>;
  /** Draws opaque boxes over regions; writes a new file (original untouched). */
  redactRegionsAsync(imageUri: string, boxes: NativeOcrBlock['box'][]): Promise<{ uri: string }>;
}

export const OneScanVision = requireOptionalNativeModule<OneScanVisionModule>('OneScanVision');
