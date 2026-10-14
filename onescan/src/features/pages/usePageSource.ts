import { useCallback, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';

export interface PageSource {
  title: string;
  /** Thumbnails / drafts, in page order. */
  items: PageItem[];
  /** Full-resolution page images, same order (masters for documents, renders for files). */
  masters: string[];
  document: DocumentRecord | null;
}

/**
 * The pages a one-source tool works on (Split, PDF → images): a OneScan document (by id or
 * picked) or a PDF file on the device. Shared so tools don't load pages their own way.
 */
export function usePageSource(documentId: string | undefined) {
  const [source, setSource] = useState<PageSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'pdf' | 'load' | null>(null);

  const fromDocument = useCallback(async (doc: DocumentRecord) => {
    setLoading(true);
    setError(null);
    try {
      const [items, pages] = await Promise.all([DocumentPageService.fromDocument(doc), documentRepository.pages(doc.id)]);
      setSource({ title: doc.title, items, masters: pages.map((p) => p.imageUri), document: doc });
    } catch {
      setError('load');
    } finally {
      setLoading(false);
    }
  }, []);

  const fromFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    setLoading(true);
    setError(null);
    try {
      const items = await DocumentPageService.fromPdfFile(res.assets[0].uri);
      setSource({ title: res.assets[0].name.replace(/\.pdf$/i, ''), items, masters: items.map((i) => i.page.sourceUri), document: null });
    } catch {
      setError('pdf');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!documentId) return;
    let alive = true;
    documentRepository
      .get(documentId)
      .then((doc) => (alive && doc ? fromDocument(doc) : alive ? setError('load') : undefined))
      .catch(() => alive && setError('load'));
    return () => {
      alive = false;
    };
  }, [documentId, fromDocument]);

  return { source, loading, error, fromDocument, fromFile, reset: () => setSource(null) };
}
