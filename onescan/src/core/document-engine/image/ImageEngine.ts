import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ImageInfo, OneScanVision } from '@/native/OneScanVision';
import type { PageFilter, Quad, Rotation } from '../model';
import { PREVIEW, QualityProfile, THUMBNAIL } from './quality';

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  /** True when the filter is baked into pixels; otherwise apply `cssFilterFor` at render. */
  filterApplied: boolean;
  /** File size in bytes, when known. */
  bytes?: number;
  /** JPEG quality used for the single encode. */
  quality: number;
  /** Memory forced a smaller size than the profile asked for. */
  degraded?: boolean;
}

export interface PageParams {
  quad: Quad | null;
  filter: PageFilter;
  rotation: Rotation;
}

/** Without the native module (Expo Go / web): rotate + optional downscale, one encode. */
async function fallbackProcess(sourceUri: string, rotation: Rotation, p: QualityProfile): Promise<ProcessedImage> {
  const ctx = ImageManipulator.manipulate(sourceUri);
  if (rotation) ctx.rotate(rotation);
  let ref = await ctx.renderAsync();
  if (p.maxEdge > 0 && Math.max(ref.width, ref.height) > p.maxEdge) {
    const scale = p.maxEdge / Math.max(ref.width, ref.height);
    ref = await ImageManipulator.manipulate(ref).resize({ width: Math.round(ref.width * scale) }).renderAsync();
  }
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: p.quality / 100 });
  return { uri: out.uri, width: out.width, height: out.height, filterApplied: false, quality: p.quality };
}

export const ImageEngine = {
  /**
   * Render a page from its original: perspective warp + rotate + filter, decoded once
   * and encoded once at the profile's size/quality. Entirely on device.
   */
  async process(sourceUri: string, params: PageParams, profile: QualityProfile): Promise<ProcessedImage> {
    if (!OneScanVision) return fallbackProcess(sourceUri, params.rotation, profile);
    const r = await OneScanVision.processPageAsync(sourceUri, params.quad, params.filter, params.rotation, profile);
    return { ...r, filterApplied: true, quality: r.quality ?? profile.quality };
  },

  /** Fast preview render for the editor (the master is rendered on save). */
  preview(sourceUri: string, params: PageParams): Promise<ProcessedImage> {
    return this.process(sourceUri, params, PREVIEW);
  },

  /** Downscaled copy of a finished image (preview / thumbnail). */
  async resize(uri: string, p: QualityProfile): Promise<{ uri: string; width: number; height: number }> {
    if (OneScanVision) return OneScanVision.resizeAsync(uri, p.maxEdge, p.quality);
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(ref.width, ref.height);
    const scaled = long > p.maxEdge ? await ImageManipulator.manipulate(ref).resize({ width: Math.round((ref.width * p.maxEdge) / long) }).renderAsync() : ref;
    const out = await scaled.saveAsync({ format: SaveFormat.JPEG, compress: p.quality / 100 });
    return { uri: out.uri, width: out.width, height: out.height };
  },

  async thumbnail(uri: string): Promise<string> {
    return (await this.resize(uri, THUMBNAIL)).uri;
  },

  /** Pixel size / file size / type without decoding (null without the native module). */
  async info(uri: string): Promise<ImageInfo | null> {
    if (!OneScanVision) return null;
    try {
      return await OneScanVision.imageInfoAsync(uri);
    } catch {
      return null;
    }
  },
};
