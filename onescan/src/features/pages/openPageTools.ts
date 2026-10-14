import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { DocumentRecord } from '@/core/document-engine/model';
import { MAX_DOCUMENT_PAGES } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';
import { usePageWorkspace } from './pageWorkspace';

/** Entry points into the page tools (Tools tab, Viewer). Each opens the shared Page Manager or a tool screen. */

/** Manage a saved document's pages (saved back into it). */
export async function openPageManager(doc: DocumentRecord) {
  const items = await DocumentPageService.fromDocument(doc);
  usePageWorkspace.getState().open({ purpose: 'document', items, documentId: doc.id, docType: doc.docType });
  router.push('/pages');
}

/**
 * Images → PDF: pick photos, then reorder / rotate / crop / preview in the Page Manager.
 * Returns false when nothing was picked. `onLoading` covers the preview rendering.
 */
export async function openImagesToPdf(onLoading?: (p: number | null) => void): Promise<boolean> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_DOCUMENT_PAGES, quality: 1 });
  if (res.canceled || !res.assets.length) return false;
  onLoading?.(0);
  try {
    const items = await DocumentPageService.fromImages(res.assets.map((a) => a.uri), (d, n) => onLoading?.(d / n));
    usePageWorkspace.getState().open({ purpose: 'images', items, docType: 'document' });
    router.push('/pages');
    return true;
  } finally {
    onLoading?.(null);
  }
}

export const openMerge = () => router.push('/tools/merge');
export const openSplit = (doc?: DocumentRecord) => router.push(doc ? { pathname: '/tools/split', params: { id: doc.id } } : '/tools/split');
export const openToImages = (doc?: DocumentRecord) => router.push(doc ? { pathname: '/tools/to-images', params: { id: doc.id } } : '/tools/to-images');
