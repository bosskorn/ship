import React, { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TEmpty, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
import { useDocuments } from './documentsStore';
import { DocumentGridItem } from './DocumentGridItem';
import { useDocumentActions } from './useDocumentActions';

/** A folder opens straight into its documents (same grid as Documents). */
export function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const folder = useDocuments((s) => s.folders.find((f) => f.id === id));
  const docsVersion = useDocuments((s) => s.documents);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const actions = useDocumentActions();
  const openDoc = (d: DocumentRecord) => router.push({ pathname: '/document/[id]', params: { id: d.id } });

  // Reload whenever the global document list changes (rename/move/delete).
  useEffect(() => {
    void documentRepository.list({ folderId: id }).then(setDocs).catch(() => setDocs([]));
  }, [id, docsVersion]);

  return (
    <TScreen surface="container" header={<TNavigationBar title={folder ? (folder.systemKey ? t(`folders.${folder.systemKey}`) : folder.name) : ''} onBack={() => router.back()} />}>
      <FlatList
        data={docs}
        numColumns={2}
        keyExtractor={(d) => d.id}
        columnWrapperStyle={{ paddingHorizontal: spacing.xs, gap: spacing.xxs }}
        ListHeaderComponent={
          docs.length ? (
            <TText variant="bodySmall" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
              {t('folders.items', { count: docs.length })}
            </TText>
          ) : null
        }
        renderItem={({ item }) => <DocumentGridItem doc={item} onPress={openDoc} onMore={actions.open} />}
        ListEmptyComponent={<TEmpty icon="folder" title={t('documents.folder_empty')} />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.lg }}
      />
      {actions.element}
    </TScreen>
  );
}
