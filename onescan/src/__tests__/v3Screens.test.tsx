/** V3 Viewer and Review render tests (Android-only build; rendered with react-test-renderer). */
import React from 'react';
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { i18n, initI18n } from '@/core/i18n';
import type { DocumentRecord, DraftPage, PageRecord } from '@/core/document-engine/model';
import { DocumentViewerScreen } from '@/features/viewer/DocumentViewerScreen';
import { EditorScreen } from '@/features/editor/EditorScreen';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: 'd1' }),
}));
jest.mock('@/features/shared/SecureImage', () => ({ SecureImage: () => null, clearReadableUris: () => undefined }));
jest.mock('@/features/documents/useDocumentActions', () => ({ useDocumentActions: () => ({ open: jest.fn(), element: null }) }));
jest.mock('@/features/viewer/PageZoomView', () => ({ PageZoomView: () => null }));
jest.mock('@/features/editor/CropEditor', () => ({ CropEditor: () => null }));
jest.mock('@/core/document-engine/storage/diskSpace', () => ({ lowDisk: () => false, isDiskFull: () => false, MIN_FREE_BYTES_SAVE: 0 }));
jest.mock('@/features/scanner/cropStats', () => ({ noteCropAccepted: jest.fn(), noteCropCorrected: jest.fn() }));
jest.mock('@/core/document-engine/image/filters', () => ({ cssFilterFor: {}, pageFilters: ['original', 'auto', 'document'] }));
jest.mock('@/core/database/repositories/documentRepository', () => ({ documentRepository: {} }));
jest.mock('@/core/document-engine/DocumentEngine', () => ({ DocumentEngine: { capture: { hasNativeVision: () => true }, export: { isShareAvailable: async () => true }, share: jest.fn() } }));
const mockViewer: { doc: DocumentRecord | null | undefined; pages: PageRecord[]; loading: boolean } = { doc: undefined, pages: [], loading: true };
jest.mock('@/features/viewer/useDocument', () => ({ useDocument: () => mockViewer }));
const mockDrafts: DraftPage[] = [];
jest.mock('@/features/scanner/scanSession', () => {
  const state = () => ({ pages: mockDrafts, docType: 'document', editingDocumentId: null, replacePage: jest.fn(), removePage: jest.fn(), duplicatePage: jest.fn(), movePage: jest.fn(), setRescan: jest.fn(), setFromEditor: jest.fn(), clear: jest.fn(), edit: jest.fn() });
  return { useScanSession: Object.assign(() => state(), { getState: state }) };
});

beforeAll(() => initI18n('th'));
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
});

const wrap = (el: React.ReactElement, lang: string) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <ThemeProvider scheme="light" language={lang}>
      <TToastProvider>{el}</TToastProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);
function render(el: React.ReactElement, lang = 'th') {
  void i18n.changeLanguage(lang);
  let r!: ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(wrap(el, lang));
  });
  mounted.push(r);
  return r;
}
const text = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string).join(' | ');
const pressable = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.find((n) => n.props.testID === id && typeof n.props.onPress === 'function');

const doc: DocumentRecord = {
  id: 'd1', title: 'ใบแจ้งหนี้', docType: 'document', folderId: null, pageCount: 2, sizeBytes: 1, pdfUri: 'p', thumbnailUri: 't',
  hasSensitive: false, isRedactedCopy: false, createdAt: 1, updatedAt: 1, openedAt: null, deletedAt: null, syncState: 'local_only',
};
const page = (i: number) => ({ id: `pg${i}`, documentId: 'd1', index: i, imageUri: 'i', sourceUri: 's', previewUri: 'v', width: 1240, height: 1754, filter: 'auto', rotation: 0 }) as unknown as PageRecord;

describe('Viewer', () => {
  it('loading → document with pages → re-render with more pages, without errors', () => {
    mockViewer.doc = undefined;
    mockViewer.pages = [];
    mockViewer.loading = true;
    const r = render(<DocumentViewerScreen />);
    expect(r.toJSON()).not.toBeNull();
    mockViewer.doc = doc;
    mockViewer.pages = [page(0)];
    mockViewer.loading = false;
    act(() => r.update(wrap(<DocumentViewerScreen />, 'th')));
    expect(text(r)).toContain('ใบแจ้งหนี้');
    mockViewer.pages = [page(0), page(1)];
    act(() => r.update(wrap(<DocumentViewerScreen />, 'th')));
    expect(text(r)).toContain('หน้า 1 / 2');
    for (const k of ['viewer-share', 'viewer-edit', 'viewer-text', 'viewer-more']) expect(pressable(r, k)).toBeTruthy();
  });

  it('missing document shows not found', () => {
    mockViewer.doc = null;
    mockViewer.pages = [];
    mockViewer.loading = false;
    const r = render(<DocumentViewerScreen />);
    expect(text(r)).toContain('ไม่พบเอกสาร');
  });
});

describe('Review', () => {
  beforeEach(() => {
    mockDrafts.length = 0;
    mockDrafts.push(
      { id: 'a', sourceUri: 's', processedUri: 'p', width: 1240, height: 1754, filter: 'auto', rotation: 0 },
      { id: 'b', sourceUri: 's', processedUri: 'p', width: 1240, height: 1754, filter: 'auto', rotation: 0 },
    );
  });

  it.each([
    ['th', 'แก้ไข', 'ครอบตัด'],
    ['en', 'Edit', 'Crop'],
  ])('%s: Edit toggle (i18n) reveals Crop / Adjust / Rotate / Delete', (lang, edit, crop) => {
    const r = render(<EditorScreen />, lang);
    const toggle = r.root.find((n) => n.props.testID === 'editor-edit-tools' && typeof n.props.onPress === 'function');
    expect(toggle.props.label).toBe(edit);
    expect(r.root.findAll((n) => n.props.testID === 'tool-crop')).toHaveLength(0);
    act(() => toggle.props.onPress());
    expect(r.root.findAll((n) => n.props.testID === 'tool-crop').length).toBeGreaterThan(0);
    expect(text(r)).toContain(crop);
    expect(pressable(r, 'editor-save')).toBeTruthy();
  });
});
