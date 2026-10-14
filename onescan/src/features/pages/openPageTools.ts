import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { DocumentRecord } from '@/core/document-engine/model';
import { MAX_DOCUMENT_PAGES } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService, LoadOptions } from '@/core/document-engine/services/DocumentPageService';
import { usePageWorkspace } from './pageWorkspace';

/** Entry points into the page tools (Tools tab, Viewer). Each opens the shared Page Manager or a tool screen. */

/** Manage a saved document's pages (saved back into it). */
export async function openPageManager(doc: DocumentRecord) {
  const items = await DocumentPageService.fromDocument(doc);
  usePageWorkspace.getState().open({ purpose: 'document', items, documentId: doc.id, docType: doc.docType });
  router.push('/pages');
}

/** Images → PDF, step 1: the system photo picker (several at once). Null when nothing was picked. */
export async function pickImagesForPdf(): Promise<string[] | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_DOCUMENT_PAGES, quality: 1 });
  return res.canceled || !res.assets.length ? null : res.assets.map((a) => a.uri);
}

/**
 * Images → PDF, step 2: previews for the picked photos (one at a time, cancellable), then the
 * Page Manager to reorder / rotate / crop / preview before creating the PDF. Returns how many
 * files were skipped (not JPEG / PNG); opens nothing when no photo could be used.
 */
export async function openImagesToPdf(uris: string[], opts: LoadOptions = {}): Promise<{ opened: boolean; skipped: number }> {
  const { items, skipped } = await DocumentPageService.fromImages(uris, opts);
  if (!items.length) return { opened: false, skipped };
  usePageWorkspace.getState().open({ purpose: 'images', items, docType: 'document' });
  router.push('/pages');
  return { opened: true, skipped };
}

export const openMerge = () => router.push('/tools/merge');
export const openSplit = (doc?: DocumentRecord) => router.push(doc ? { pathname: '/tools/split', params: { id: doc.id } } : '/tools/split');
export const openToImages = (doc?: DocumentRecord) => router.push(doc ? { pathname: '/tools/to-images', params: { id: doc.id } } : '/tools/to-images');
