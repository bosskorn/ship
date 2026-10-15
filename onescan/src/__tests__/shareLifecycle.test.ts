import { ExportEngine } from '@/core/document-engine/export/ExportEngine';
import { SHARE_COPY_MIN_AGE_MS, sweepShareCopies } from '@/core/document-engine/export/shareTemp';

const calls: string[] = [];
const mockNative: Record<string, jest.Mock | undefined> = {};
jest.mock('@/native/OneScanVision', () => ({
  get OneScanVision() {
    return mockNative;
  },
}));
const mockShare = jest.fn();
jest.mock('expo-sharing', () => ({ shareAsync: (...a: unknown[]) => mockShare(...a), isAvailableAsync: async () => true }));

function native(withShareCopy = true) {
  calls.length = 0;
  for (const k of Object.keys(mockNative)) delete mockNative[k];
  mockNative.plainUriAsync = jest.fn(async () => {
    calls.push('plainUri');
    return 'file:///cache/onescan/plain/abc/Doc.pdf';
  });
  mockNative.sweepShareCopiesAsync = jest.fn(async () => {
    calls.push('sweep');
    return 0;
  });
  if (withShareCopy)
    mockNative.shareCopyAsync = jest.fn(async (_u: string, name: string) => {
      calls.push('copy');
      return `file:///cache/onescan/share/1-x/${name}`;
    });
  mockShare.mockReset();
  mockShare.mockImplementation(async () => {
    calls.push('share');
  });
}

describe('share plaintext lifecycle (1.2.x QA)', () => {
  it('shares a share-only copy, never the reusable plain cache, and sweeps before and after', async () => {
    native();
    await ExportEngine.sharePdf('file:///docs/d1/document.pdf', 'ใบเสร็จ 15/10');
    expect(calls).toEqual(['sweep', 'copy', 'share', 'sweep']);
    expect(mockNative.plainUriAsync).not.toHaveBeenCalled();
    expect(mockNative.shareCopyAsync).toHaveBeenCalledWith('file:///docs/d1/document.pdf', 'ใบเสร็จ 15 10.pdf');
    expect(mockShare.mock.calls[0][0]).toBe('file:///cache/onescan/share/1-x/ใบเสร็จ 15 10.pdf');
  });

  it('does not delete the copy just shared: the sweep only removes copies older than the minimum age', async () => {
    native();
    await ExportEngine.sharePdf('file:///docs/d1/document.pdf', 'Doc');
    for (const c of mockNative.sweepShareCopiesAsync!.mock.calls) expect(c[0]).toBe(SHARE_COPY_MIN_AGE_MS);
    expect(SHARE_COPY_MIN_AGE_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it('still sweeps when the share sheet fails, and reports the failure', async () => {
    native();
    mockShare.mockRejectedValueOnce(new Error('no activity'));
    await expect(ExportEngine.sharePdf('file:///docs/d1/document.pdf', 'Doc')).rejects.toThrow('no activity');
    expect(calls).toEqual(['sweep', 'copy', 'sweep']);
  });

  it('falls back to the readable copy when the native share copy is unavailable (iOS / older module)', async () => {
    native(false);
    await ExportEngine.sharePdf('file:///docs/d1/document.pdf', 'Doc');
    expect(calls).toEqual(['sweep', 'plainUri', 'share', 'sweep']);
  });

  it('sweeping never throws (best effort)', async () => {
    native();
    mockNative.sweepShareCopiesAsync!.mockRejectedValueOnce(new Error('io'));
    await expect(sweepShareCopies()).resolves.toBe(0);
    delete mockNative.sweepShareCopiesAsync;
    await expect(sweepShareCopies()).resolves.toBe(0);
  });
});
