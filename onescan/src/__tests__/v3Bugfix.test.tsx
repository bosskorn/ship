/**
 * Regression tests for the V3 bug fixes (OneScan 1.3):
 *  4. launch-time cleanup of decrypted copies never races a read (thumbnail / page / share)
 *  2. multi-select Share works only for exactly one document (never "first of many")
 *  3. Move with no folders explains and offers "create folder" (no empty menu)
 *  1. Review's Edit button uses its own i18n key
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import type { DocumentRecord } from '@/core/document-engine/model';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { useSettings } from '@/core/config/settingsStore';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
const mockOrder: string[] = [];
const mockRefresh = jest.fn(async () => void mockOrder.push('list'));
const mockState: { documents: DocumentRecord[]; folders: { id: string; name: string; systemKey: null; createdAt: number; itemCount: number }[] } = { documents: [], folders: [] };
jest.mock('@/features/documents/documentsStore', () => {
  const state = () => ({ documents: mockState.documents, recent: mockState.documents, folders: mockState.folders, tags: [], tagMap: {}, loaded: true, refresh: mockRefresh });
  const useDocuments = (sel?: (s: ReturnType<typeof state>) => unknown) => (sel ? sel(state()) : state());
  useDocuments.getState = state;
  return { useDocuments };
});
jest.mock('@/features/documents/useDocumentActions', () => ({ useDocumentActions: () => ({ open: jest.fn(), element: null }) }));
jest.mock('@/features/shared/useImport', () => ({ useImport: () => ({ importPdf: jest.fn(), importPhotos: jest.fn(), overlay: null }) }));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null, useReadableUri: () => null, clearReadableUris: () => undefined }));
jest.mock('@/core/database/repositories/documentRepository', () => ({ documentRepository: { move: jest.fn() }, folderRepository: { create: jest.fn() } }));
jest.mock('@/core/database/repositories/tagRepository', () => ({ tagRepository: {} }));
const mockShare = jest.fn(async () => undefined);
jest.mock('@/core/document-engine/DocumentEngine', () => ({
  DocumentEngine: {
    share: (...a: unknown[]) => mockShare(...(a as [])),
    export: { isShareAvailable: async () => true },
    moveToTrash: jest.fn(),
    deletePermanently: jest.fn(),
    duplicate: jest.fn(),
    capture: { hasNativeVision: () => true },
  },
}));


beforeAll(() => initI18n('th'));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  mockShare.mockClear();
});

function render(el: React.ReactElement, lang = 'th') {
  void i18n.changeLanguage(lang);
  let r!: ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider scheme="light" language={lang}>
          <TToastProvider>{el}</TToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.find((n) => n.props.testID === id && (typeof n.props.onPress === 'function' || typeof n.props.onLongPress === 'function'));
const dialog = (r: ReactTestRenderer, title: string) => r.root.findAll((n) => n.props.title === title && 'visible' in n.props)[0];

const doc = (id: string): DocumentRecord => ({
  id, title: `Doc ${id}`, docType: 'document', folderId: null, pageCount: 1, sizeBytes: 1, pdfUri: 'p', thumbnailUri: 't',
  hasSensitive: false, isRedactedCopy: false, createdAt: 1, updatedAt: 1, openedAt: null, deletedAt: null, syncState: 'local_only',
});

// ---------------------------------------------------------------- 4. startup cleanup race

describe('launch-time cleanup of decrypted copies (bug 4)', () => {
  function loadNative() {
    let release!: () => void;
    const native = {
      clearPlainCacheAsync: jest.fn(() => new Promise<void>((res) => (release = res))),
      plainUriAsync: jest.fn(async (u: string) => `plain:${u}`),
      processPageAsync: jest.fn(async () => ({})),
      writePdfAsync: jest.fn(async () => ({})),
      recognizeTextAsync: jest.fn(async () => ({})),
      renderPdfAsync: jest.fn(async () => ({})),
      encryptFileAsync: jest.fn(async () => undefined),
      databaseKeyAsync: jest.fn(async () => 'k'),
    };
    let mod!: typeof import('@/native/OneScanVision');
    jest.isolateModules(() => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('@/native/OneScanVision');
    });
    return { native, mod, release: () => release() };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('no decrypted copy is made, and no document file is read, until the cleanup has finished', async () => {
    const { native, mod, release } = loadNative();
    const ready = mod.plainCacheReady();
    const reads = [
      mod.OneScanVision!.plainUriAsync!('file:///docs/a/thumb.jpg', null),
      mod.OneScanVision!.processPageAsync('file:///docs/a/p0.jpg', null, 'auto', 0),
      mod.OneScanVision!.writePdfAsync(['file:///docs/a/p0.jpg']),
      mod.OneScanVision!.recognizeTextAsync('file:///docs/a/p0.jpg', ['th']),
      mod.OneScanVision!.renderPdfAsync('file:///docs/b/doc.pdf', 800),
    ];
    await tick();
    expect(native.clearPlainCacheAsync).toHaveBeenCalledTimes(1);
    for (const fn of [native.plainUriAsync, native.processPageAsync, native.writePdfAsync, native.recognizeTextAsync, native.renderPdfAsync]) {
      expect(fn).not.toHaveBeenCalled();
    }
    release();
    await ready;
    await Promise.all(reads);
    expect(native.plainUriAsync).toHaveBeenCalledWith('file:///docs/a/thumb.jpg', null);
    expect(native.processPageAsync).toHaveBeenCalledTimes(1);
    // Exactly one cleanup per launch, however many readers.
    await mod.OneScanVision!.plainUriAsync!('file:///docs/c/thumb.jpg', null);
    expect(native.clearPlainCacheAsync).toHaveBeenCalledTimes(1);
  });

  it('a reader that comes first still waits for the cleanup it starts', async () => {
    const { native, mod, release } = loadNative();
    const read = mod.OneScanVision!.plainUriAsync!('file:///docs/a/thumb.jpg', null);
    await tick();
    expect(native.clearPlainCacheAsync).toHaveBeenCalledTimes(1);
    expect(native.plainUriAsync).not.toHaveBeenCalled();
    release();
    await expect(read).resolves.toBe('plain:file:///docs/a/thumb.jpg');
  });

  it('calls that do not read document files are not delayed', async () => {
    const { native, mod } = loadNative();
    void mod.plainCacheReady();
    await mod.OneScanVision!.databaseKeyAsync!();
    await mod.OneScanVision!.encryptFileAsync!('a', 'b');
    expect(native.databaseKeyAsync).toHaveBeenCalled();
    expect(native.encryptFileAsync).toHaveBeenCalled();
  });

  it('a failed cleanup never blocks reading', async () => {
    const native = { clearPlainCacheAsync: jest.fn(async () => { throw new Error('io'); }), plainUriAsync: jest.fn(async () => 'plain') };
    let mod!: typeof import('@/native/OneScanVision');
    jest.isolateModules(() => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('@/native/OneScanVision');
    });
    await expect(mod.OneScanVision!.plainUriAsync!('x', null)).resolves.toBe('plain');
  });

  it('startup starts the cleanup before the document list loads; background maintenance no longer clears plain/', async () => {
    const order = mockOrder;
    order.length = 0;
    let bootstrap!: typeof import('@/features/shared/bootstrap');
    jest.isolateModules(() => {
      jest.doMock('@/native/OneScanVision', () => ({ plainCacheReady: jest.fn(() => { order.push('plain-cleanup'); return new Promise(() => undefined); }), OneScanVision: null }));
      jest.doMock('@/core/document-engine/storage/maintenance', () => ({
        cleanCache: async () => void order.push('cleanCache'),
        sweepOrphanFolders: async () => 0,
        encryptExistingFiles: async () => ({ encrypted: 0, failed: 0 }),
      }));
      jest.doMock('@/core/document-engine/DocumentEngine', () => ({ DocumentEngine: { emptyExpiredTrash: async () => undefined } }));
      jest.doMock('@/features/shared/SecureImage', () => ({ clearReadableUris: () => undefined }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      bootstrap = require('@/features/shared/bootstrap');
    });
    // The list does not wait for the cleanup (it reads only the database)…
    await bootstrap.bootstrapLocalData();
    expect(order[0]).toBe('plain-cleanup');
    expect(order).toContain('list');
    // …and file readers are the ones that wait (tested above).
    const maintenance = fs.readFileSync(path.join(__dirname, '../core/document-engine/storage/maintenance.ts'), 'utf8');
    expect(maintenance.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toMatch(/clearPlainCacheAsync/);
  });
});

// ---------------------------------------------------------------- 2 + 3. multi-select

describe('Documents multi-select (bugs 2, 3)', () => {
  beforeEach(() => {
    useSettings.setState({ documentsView: 'list' });
    mockState.documents = [doc('1'), doc('2'), doc('3')];
    mockState.folders = [];
  });

  async function select(r: ReactTestRenderer, ...ids: string[]) {
    await act(async () => byId(r, `doc-${ids[0]}`).props.onLongPress());
    for (const id of ids.slice(1)) await act(async () => byId(r, `doc-${id}`).props.onPress());
  }

  it('Share is enabled for exactly one selected document and shares that one', async () => {
    const r = render(<DocumentsScreen />);
    await select(r, '2');
    const share = byId(r, 'selection-share');
    expect(share.props.disabled).toBe(false);
    await act(async () => share.props.onPress());
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect((mockShare.mock.calls[0] as unknown[])[0]).toMatchObject({ id: '2' });
  });

  it('with several selected, Share is disabled and nothing is shared', async () => {
    const r = render(<DocumentsScreen />);
    await select(r, '1', '2', '3');
    const share = byId(r, 'selection-share');
    expect(share.props.disabled).toBe(true);
    expect(share.props.accessibilityState).toEqual({ disabled: true });
    await act(async () => share.props.onPress());
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('Move with no folders explains and offers to create one (no empty menu)', async () => {
    const r = render(<DocumentsScreen />);
    await select(r, '1', '2');
    await act(async () => byId(r, 'selection-move').props.onPress());
    const empty = dialog(r, 'ยังไม่มีโฟลเดอร์');
    expect(empty.props.visible).toBe(true);
    expect(empty.props.content).toBe('สร้างโฟลเดอร์เพื่อจัดเอกสารในแบบของคุณ');
    // The folder picker stays closed.
    expect(dialog(r, 'ย้าย').props.visible).toBe(false);
    // "Create folder" opens the new-folder dialog; the selection is kept for the move.
    const create = empty.props.actions.find((a: { label: string }) => a.label === 'สร้างโฟลเดอร์');
    await act(async () => create.onPress());
    expect(dialog(r, 'ยังไม่มีโฟลเดอร์').props.visible).toBe(false);
    expect(r.root.findAll((n) => n.props.visible === true && n.props.title === i18n.t('documents.new_folder')).length).toBeGreaterThan(0);
    expect(byId(r, 'selection-move')).toBeTruthy();
  });

  it('Move with folders opens the folder picker', async () => {
    mockState.folders = [{ id: 'f1', name: 'งาน', systemKey: null, createdAt: 1, itemCount: 0 }];
    const r = render(<DocumentsScreen />);
    await select(r, '1');
    await act(async () => byId(r, 'selection-move').props.onPress());
    const picker = dialog(r, 'ย้าย');
    expect(picker.props.visible).toBe(true);
    expect(picker.props.items).toEqual([expect.objectContaining({ key: 'f1', label: 'งาน' })]);
  });
});

// ---------------------------------------------------------------- 1. Review Edit label

describe('Review Edit button (bug 1)', () => {
  it('uses its own i18n key in every language, with no lookup of other keys', () => {
    const src = fs.readFileSync(path.join(__dirname, '../features/editor/EditorScreen.tsx'), 'utf8');
    expect(src).toContain("t('editor.edit_tools')");
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/===\s*'เปลี่ยนชื่อ'|'แก้ไข'|'Edit'/);
    void i18n.changeLanguage('th');
    expect(i18n.t('editor.edit_tools')).toBe('แก้ไข');
    void i18n.changeLanguage('en');
    expect(i18n.t('editor.edit_tools')).toBe('Edit');
  });
});
