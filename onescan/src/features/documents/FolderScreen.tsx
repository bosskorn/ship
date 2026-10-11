import React, { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TDivider, TEmpty, TNavigationBar, TScreen, useTheme } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
import { useDocuments } from './documentsStore';
import { DocumentListItem } from './DocumentListItem';
import { useDocumentActions } from './useDocumentActions';

export function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const folder = useDocuments((s) => s.folders.find((f) => f.id === id));
  const docsVersion = useDocuments((s) => s.documents);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const actions = useDocumentActions();

  // Reload whenever the global document list changes (rename/move/delete).
  useEffect(() => {
    void documentRepository.list({ folderId: id }).then(setDocs).catch(() => setDocs([]));
  }, [id, docsVersion]);

  return (
    <TScreen header={<TNavigationBar title={folder ? (folder.systemKey ? t(`folders.${folder.systemKey}`) : folder.name) : ''} onBack={() => router.back()} divider />}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        ItemSeparatorComponent={() => <TDivider inset={spacing.md + 44 + spacing.sm} />}
        renderItem={({ item }) => (
          <DocumentListItem doc={item} onPress={(d) => router.push({ pathname: '/document/[id]', params: { id: d.id } })} onMore={actions.open} />
        )}
        ListEmptyComponent={<TEmpty icon="folder" title={t('documents.folder_empty')} />}
        contentContainerStyle={{ backgroundColor: colors.bgContainer, flexGrow: 1 }}
      />
      {actions.element}
    </TScreen>
  );
}
