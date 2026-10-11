import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TDialog, TDivider, TEmpty, TIconButton, TInput, TNavigationBar, TScreen, TSearch, TTabs, TText, useTheme } from '@/design-system';
import { folderRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord, FolderRecord } from '@/core/document-engine/model';
import { useDocuments } from './documentsStore';
import { DocumentListItem } from './DocumentListItem';
import { useDocumentActions } from './useDocumentActions';

type Tab = 'all' | 'folders' | 'recent';

export function DocumentsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [tab, setTab] = useState<Tab>('all');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const { documents, folders, refresh } = useDocuments();
  const actions = useDocumentActions();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const recent = useMemo(
    () => [...documents].sort((a, b) => (b.openedAt ?? b.updatedAt) - (a.openedAt ?? a.updatedAt)).slice(0, 30),
    [documents],
  );

  const openDoc = useCallback((d: DocumentRecord) => router.push({ pathname: '/document/[id]', params: { id: d.id } }), []);
  const inset = spacing.md + 44 + spacing.sm;

  return (
    <TScreen
      header={
        <View style={{ backgroundColor: colors.bgContainer }}>
          <TNavigationBar
            large
            title={t('documents.title')}
            right={<TIconButton icon="folderAdd" accessibilityLabel={t('documents.new_folder')} onPress={() => setNewFolder('')} />}
          />
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
            <TSearch placeholder={t('documents.search_placeholder')} onPressEntry={() => router.push('/search')} />
          </View>
          <TTabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'all', label: t('documents.tab_all') },
              { key: 'folders', label: t('documents.tab_folders') },
              { key: 'recent', label: t('documents.tab_recent') },
            ]}
          />
        </View>
      }
    >
      {tab === 'folders' ? (
        <FlatList<FolderRecord>
          data={folders}
          keyExtractor={(f) => f.id}
          ItemSeparatorComponent={() => <TDivider inset={spacing.md + 24 + spacing.sm} />}
          renderItem={({ item }) => (
            <TCell
              icon="folder"
              iconColor={colors.brand}
              title={item.systemKey ? t(`folders.${item.systemKey}`) : item.name}
              note={t('folders.items', { count: item.itemCount })}
              arrow
              onPress={() => router.push({ pathname: '/folder/[id]', params: { id: item.id } })}
            />
          )}
        />
      ) : (
        <FlatList<DocumentRecord>
          data={tab === 'all' ? documents : recent}
          keyExtractor={(d) => d.id}
          // Virtualized list (spec §52): thumbnails are small cached JPEGs, PDFs are never loaded here.
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          ItemSeparatorComponent={() => <TDivider inset={inset} />}
          renderItem={({ item }) => <DocumentListItem doc={item} onPress={openDoc} onMore={actions.open} />}
          ListEmptyComponent={<TEmpty icon="documents" title={t('documents.empty')} description={t('documents.empty_hint')} />}
          contentContainerStyle={{ backgroundColor: colors.bgContainer, flexGrow: 1 }}
        />
      )}
      {actions.element}
      <TDialog
        visible={newFolder !== null}
        title={t('documents.new_folder')}
        onRequestClose={() => setNewFolder(null)}
        actions={[
          { label: t('common.cancel'), onPress: () => setNewFolder(null) },
          {
            label: t('common.save'),
            tone: 'primary',
            onPress: async () => {
              const name = newFolder?.trim();
              setNewFolder(null);
              if (name) {
                await folderRepository.create(name);
                await refresh();
                setTab('folders');
              }
            },
          },
        ]}
      >
        <TText variant="bodySmall" color="textSecondary">
          {t('documents.folder_name')}
        </TText>
        <TInput value={newFolder ?? ''} onChangeText={setNewFolder} autoFocus maxLength={60} />
      </TDialog>
    </TScreen>
  );
}
