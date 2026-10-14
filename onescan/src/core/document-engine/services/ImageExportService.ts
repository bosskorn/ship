import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { newId } from '../ids';
import { CancelSignal, throwIfCancelled } from '../cancel';
import { DocumentFileStore } from '../storage/DocumentFileStore';

export type ImageFormat = 'jpg' | 'png';

export interface ExportedImages {
  dir: Directory;
  files: { uri: string; name: string; mimeType: string }[];
}

const MIME: Record<ImageFormat, string> = { jpg: 'image/jpeg', png: 'image/png' };

/** File-name-safe base name (same rules as PDF sharing). */
export function imageBaseName(title: string): string {
  return title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || 'OneScan';
}

/** `<base>_p03.jpg` — zero-padded so files sort in page order. */
export function imageFileName(base: string, pageNumber: number, pageCount: number, format: ImageFormat): string {
  const width = Math.max(2, String(pageCount).length);
  return `${base}_p${String(pageNumber).padStart(width, '0')}.${format}`;
}

/**
 * PDF → images, on device. Pages are written as JPG (the page master itself, decrypted) or
 * PNG (re-encoded losslessly) into a fresh folder inside the decrypted cache
 * (`<cache>/onescan/plain`), which follows the same lifecycle as shared PDFs: cleared at
 * every launch and size-capped. Saving to the device copies the files to a folder the user
 * picks (Storage Access Framework, no permission) and then removes the cache copies.
 */
export const ImageExportService = {
  async exportPages(
    pages: { uri: string; pageNumber: number }[],
    opts: { title: string; pageCount: number; format: ImageFormat; onProgress?: (done: number, total: number) => void; signal?: CancelSignal },
  ): Promise<ExportedImages> {
    const dir = new Directory(Paths.cache, 'onescan', 'plain', `export-${newId()}`);
    dir.create({ intermediates: true, idempotent: true });
    const base = imageBaseName(opts.title);
    const files: ExportedImages['files'] = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        throwIfCancelled(opts.signal);
        const name = imageFileName(base, pages[i].pageNumber, opts.pageCount, opts.format);
        const target = new File(dir, name);
        const readable = await DocumentFileStore.readableUri(pages[i].uri);
        if (opts.format === 'jpg') {
          new File(readable).copySync(target);
        } else {
          const png = await ImageManipulator.manipulateAsync(readable, [], { format: ImageManipulator.SaveFormat.PNG });
          const out = new File(png.uri);
          out.copySync(target);
          out.delete();
        }
        files.push({ uri: target.uri, name, mimeType: MIME[opts.format] });
        opts.onProgress?.(i + 1, pages.length);
      }
      return { dir, files };
    } catch (e) {
      this.discard({ dir });
      throw e;
    }
  },

  /**
   * Copies the images into a folder the user picks. Returns how many were saved, or null if
   * the user cancelled the folder picker. The cache copies are removed either way.
   */
  async saveToDevice(exported: ExportedImages): Promise<number | null> {
    try {
      let target: Directory;
      try {
        target = await Directory.pickDirectoryAsync();
      } catch {
        return null;
      }
      for (const f of exported.files) {
        const out = target.createFile(f.name, f.mimeType);
        out.write(new File(f.uri).bytesSync());
      }
      return exported.files.length;
    } finally {
      this.discard(exported);
    }
  },

  /** One image through the share sheet (several are not shared: the share engine takes one file). */
  async shareOne(exported: ExportedImages): Promise<void> {
    if (exported.files.length !== 1) throw new Error('share_one_only');
    const f = exported.files[0];
    await Sharing.shareAsync(f.uri, { mimeType: f.mimeType, dialogTitle: f.name });
    // The receiving app may still be reading: the copy is removed with the decrypted cache at next launch.
  },

  discard(exported: Pick<ExportedImages, 'dir'>) {
    try {
      if (exported.dir.exists) exported.dir.delete();
    } catch {
      // cleared with the decrypted cache at next launch
    }
  },
};
