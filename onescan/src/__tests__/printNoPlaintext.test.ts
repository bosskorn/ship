/**
 * Print hands the encrypted file's URI to the native adapter, which decrypts straight into the
 * Android print spooler: no decrypted copy (plain cache) is ever requested for printing.
 */
const mockNative = {
  printPdfAsync: jest.fn(async () => undefined),
  plainUriAsync: jest.fn(async () => 'file:///cache/onescan/plain/x.pdf'),
  plainSizeAsync: jest.fn(async () => 1234),
};
jest.mock('@/native/OneScanVision', () => ({ OneScanVision: mockNative }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

/* eslint-disable @typescript-eslint/no-require-imports -- loaded after the mocks above are initialised */
const { ExportEngine } = require('@/core/document-engine/export/ExportEngine') as typeof import('@/core/document-engine/export/ExportEngine');
const { DocumentFileStore } = require('@/core/document-engine/storage/DocumentFileStore') as typeof import('@/core/document-engine/storage/DocumentFileStore');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('print', () => {
  it('uses the native adapter with the stored (encrypted) file, never a decrypted copy', async () => {
    expect(ExportEngine.canPrint()).toBe(true);
    await ExportEngine.printPdf('file:///data/docs/d1/document.pdf', 'สัญญา: เช่า/คอนโด');
    expect(mockNative.printPdfAsync).toHaveBeenCalledWith('file:///data/docs/d1/document.pdf', 'สัญญา  เช่า คอนโด');
    expect(mockNative.plainUriAsync).not.toHaveBeenCalled();
  });

  it('is not offered without the native adapter', async () => {
    const saved = mockNative.printPdfAsync;
    (mockNative as Partial<typeof mockNative>).printPdfAsync = undefined;
    expect(ExportEngine.canPrint()).toBe(false);
    await expect(ExportEngine.printPdf('file:///x.pdf', 'x')).rejects.toThrow('print_unavailable');
    mockNative.printPdfAsync = saved;
  });

  it('PDF size comes from the native size of the stored file', async () => {
    expect(await DocumentFileStore.contentBytes('file:///data/docs/d1/document.pdf')).toBe(1234);
  });
});
