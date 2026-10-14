import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useDocuments } from '@/features/documents/documentsStore';
import type { DocumentRecord, PageRecord } from '@/core/document-engine/model';

export function useDocument(id: string | undefined) {
  // Local-first: seed with cached document from memory store so title/metadata render immediately on frame 0
  const cached = id ? useDocuments.getState().documents.find((d) => d.id === id) : undefined;
  const [doc, setDoc] = useState<DocumentRecord | null | undefined>(cached ?? undefined);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [loading, setLoading] = useState(!cached);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!id) {
        // No document to load: show "not found" instead of loading forever.
        Promise.resolve().then(() => alive && setDoc(null));
        return () => {
          alive = false;
        };
      }
      (async () => {
        try {
          const d = await documentRepository.get(id);
          const p = d ? await documentRepository.pages(id) : [];
          if (!alive) return;
          setDoc(d);
          setPages(p);
          setLoading(false);
          if (d) void documentRepository.markOpened(id);
        } catch {
          if (alive) {
            setDoc(null);
            setLoading(false);
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, [id]),
  );

  return { doc, pages, loading };
}

