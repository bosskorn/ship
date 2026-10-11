import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord, PageRecord } from '@/core/document-engine/model';

export function useDocument(id: string | undefined) {
  const [doc, setDoc] = useState<DocumentRecord | null | undefined>(undefined);
  const [pages, setPages] = useState<PageRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let alive = true;
      (async () => {
        try {
          const d = await documentRepository.get(id);
          const p = d ? await documentRepository.pages(id) : [];
          if (!alive) return;
          setDoc(d);
          setPages(p);
          if (d) void documentRepository.markOpened(id);
        } catch {
          if (alive) setDoc(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, [id]),
  );

  return { doc, pages };
}
