import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { OneScanVision } from '@/native/OneScanVision';
import type { PageFilter, Quad, Rotation } from '../model';

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  /** True when the filter is baked into pixels; otherwise apply `cssFilterFor` at render. */
  filterApplied: boolean;
}

const MAX_EDGE = 2480; // ~A4 @ 300dpi long edge; caps memory per page.

export const ImageEngine = {
  /**
   * Edge-corrected, rotated, enhanced page. Entirely on device.
   * Native path: perspective warp + filter + denoise/shadow removal.
   * Fallback: rotate + downscale only.
   */
  async process(sourceUri: string, opts: { quad: Quad | null; filter: PageFilter; rotation: Rotation }): Promise<ProcessedImage> {
    if (OneScanVision) {
      const r = await OneScanVision.processPageAsync(sourceUri, opts.quad, opts.filter, opts.rotation);
      return { ...r, filterApplied: true };
    }
    const ctx = ImageManipulator.manipulate(sourceUri);
    if (opts.rotation) ctx.rotate(opts.rotation);
    const ref = await ctx.renderAsync();
    if (Math.max(ref.width, ref.height) > MAX_EDGE) {
      const scale = MAX_EDGE / Math.max(ref.width, ref.height);
      const resized = await ImageManipulator.manipulate(ref)
        .resize({ width: Math.round(ref.width * scale) })
        .renderAsync();
      const out = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      return { uri: out.uri, width: out.width, height: out.height, filterApplied: false };
    }
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: out.uri, width: out.width, height: out.height, filterApplied: false };
  },

  async thumbnail(uri: string, width = 240): Promise<string> {
    const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    return out.uri;
  },
};
