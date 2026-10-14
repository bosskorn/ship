/** PDF → images: names, location (decrypted cache, cleared at launch), cleanup, one-file share. */
const mockFs = { files: new Map<string, string>(), dirs: new Set<string>(), picked: null as null | string, pickCancelled: false };
jest.mock('expo-file-system', () => {
  const join = (...p: unknown[]) => p.map((x) => (typeof x === 'string' ? x : (x as { uri: string }).uri)).join('/');
  class File {
    uri: string;
    constructor(...p: unknown[]) {
      this.uri = join(...p);
    }
    copySync(to: File) {
      mockFs.files.set(to.uri, mockFs.files.get(this.uri) ?? '');
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
    bytesSync() {
      return mockFs.files.get(this.uri);
    }
    write(b: string) {
      mockFs.files.set(this.uri, b);
    }
  }
  class Directory {
    uri: string;
    constructor(...p: unknown[]) {
      this.uri = join(...p);
    }
    get exists() {
      return mockFs.dirs.has(this.uri);
    }
    create() {
      mockFs.dirs.add(this.uri);
    }
    delete() {
      mockFs.dirs.delete(this.uri);
      for (const k of [...mockFs.files.keys()]) if (k.startsWith(this.uri + '/')) mockFs.files.delete(k);
    }
    createFile(name: string) {
      return new File(this, name);
    }
    static async pickDirectoryAsync() {
      if (mockFs.pickCancelled) throw new Error('cancelled');
      mockFs.dirs.add('content://picked');
      return new Directory('content://picked');
    }
  }
  return { File, Directory, Paths: { cache: 'file:///cache' } };
});
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { PNG: 'png', JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async (uri: string) => {
    const out = `file:///manip/${uri.split('/').pop()}.png`;
    mockFs.files.set(out, `png(${mockFs.files.get(uri)})`);
    return { uri: out };
  }),
}));
const mockShare = jest.fn(async () => undefined);
jest.mock('expo-sharing', () => ({ shareAsync: (...a: unknown[]) => mockShare(...(a as [])) }));
jest.mock('@/core/document-engine/storage/DocumentFileStore', () => ({
  DocumentFileStore: { readableUri: async (uri: string) => uri.replace('file:///docs/', 'file:///cache/onescan/plain/') },
}));
jest.mock('@/core/document-engine/ids', () => ({ newId: () => 'x1' }));

/* eslint-disable @typescript-eslint/no-require-imports -- after the mocks above */
const { ImageExportService, imageFileName, imageBaseName } = require('@/core/document-engine/services/ImageExportService') as typeof import('@/core/document-engine/services/ImageExportService');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.pickCancelled = false;
  mockShare.mockClear();
  for (let i = 1; i <= 3; i++) mockFs.files.set(`file:///cache/onescan/plain/d/p${i}.jpg`, `jpeg${i}`);
});

const pages = [1, 2, 3].map((n) => ({ uri: `file:///docs/d/p${n}.jpg`, pageNumber: n }));

describe('PDF → images', () => {
  it('names sort in page order and are file-system safe', () => {
    expect(imageFileName('Lease', 3, 12, 'jpg')).toBe('Lease_p03.jpg');
    expect(imageFileName('Lease', 7, 120, 'png')).toBe('Lease_p007.png');
    expect(imageBaseName('a/b: "c"')).toBe('a b   c');
  });

  it('JPG = the page master itself, written inside the decrypted cache (cleared at launch)', async () => {
    const out = await ImageExportService.exportPages(pages, { title: 'Lease', pageCount: 3, format: 'jpg' });
    expect(out.files.map((f) => f.uri)).toEqual([1, 2, 3].map((n) => `file:///cache/onescan/plain/export-x1/Lease_p0${n}.jpg`));
    expect(out.files.map((f) => mockFs.files.get(f.uri))).toEqual(['jpeg1', 'jpeg2', 'jpeg3']);
    expect(out.files.every((f) => f.mimeType === 'image/jpeg')).toBe(true);
  });

  it('PNG is re-encoded and the converter’s own temporary file is removed', async () => {
    const out = await ImageExportService.exportPages(pages.slice(0, 1), { title: 'Lease', pageCount: 3, format: 'png' });
    expect(mockFs.files.get(out.files[0].uri)).toBe('png(jpeg1)');
    expect([...mockFs.files.keys()].some((k) => k.startsWith('file:///manip/'))).toBe(false);
  });

  it('saving copies to the chosen folder and removes the cache copies; cancelling also cleans up', async () => {
    const out = await ImageExportService.exportPages(pages, { title: 'Lease', pageCount: 3, format: 'jpg' });
    expect(await ImageExportService.saveToDevice(out)).toBe(3);
    expect(mockFs.files.get('content://picked/Lease_p02.jpg')).toBe('jpeg2');
    expect([...mockFs.files.keys()].some((k) => k.includes('/export-x1/'))).toBe(false);
    const again = await ImageExportService.exportPages(pages, { title: 'Lease', pageCount: 3, format: 'jpg' });
    mockFs.pickCancelled = true;
    expect(await ImageExportService.saveToDevice(again)).toBeNull();
    expect([...mockFs.files.keys()].some((k) => k.includes('/export-x1/'))).toBe(false);
  });

  it('shares exactly one image, never "the first of many"', async () => {
    const three = await ImageExportService.exportPages(pages, { title: 'Lease', pageCount: 3, format: 'jpg' });
    await expect(ImageExportService.shareOne(three)).rejects.toThrow('share_one_only');
    expect(mockShare).not.toHaveBeenCalled();
    const one = await ImageExportService.exportPages(pages.slice(1, 2), { title: 'Lease', pageCount: 3, format: 'jpg' });
    await ImageExportService.shareOne(one);
    expect(mockShare).toHaveBeenCalledWith(one.files[0].uri, expect.objectContaining({ mimeType: 'image/jpeg' }));
  });
});
