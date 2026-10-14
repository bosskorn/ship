import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
import type { PageItem } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService, LoadOptions } from '@/core/document-engine/services/DocumentPageService';

export interface PageSource {
  title: string;
  /** Thumbnails / drafts, in page order. */
  items: PageItem[];
  /** Full-resolution page images, same order (masters for documents, renders for files). */
  masters: string[];
  document: DocumentRecord | null;
}

/** The system file picker for one PDF (no storage permission needed). */
export async function pickPdf(): Promise<{ uri: string; name: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  return res.canceled || !res.assets[0] ? null : { uri: res.assets[0].uri, name: res.assets[0].name };
}

/**
 * The pages a one-source tool works on (Split, PDF → images): a OneScan document (by id or
 * picked) or a PDF file on the device. Shared so tools don't load pages their own way.
 * Pages rendered from a file are working files: they are removed when the tool closes.
 */
export function usePageSource(documentId: string | undefined) {
  const [source, setSource] = useState<PageSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'pdf' | 'load' | null>(null);
  const loaded = useRef<PageItem[]>([]);

  useEffect(() => () => DocumentPageService.discard(loaded.current), []);

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

  /** Renders the file page by page (progress, cancel; errors are thrown to the caller's task). */
  const fromFile = useCallback(async (file: { uri: string; name: string }, opts: LoadOptions = {}) => {
    setError(null);
    const items = await DocumentPageService.fromPdfFile(file.uri, opts);
    DocumentPageService.discard(loaded.current);
    loaded.current = items;
    setSource({ title: file.name.replace(/\.pdf$/i, ''), items, masters: items.map((i) => i.page.sourceUri), document: null });
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

  return { source, loading, error, fromDocument, fromFile };
}
