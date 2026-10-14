import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  haptics, TActionSheet, TButton, TCell, TChip, TChipRow, TDialog, TDivider, TEmpty, TIcon, TIconButton, TInput, TScreen, TText,
  TTopAppBar, useTheme, useToast,
} from '@/design-system';
import { documentRepository, folderRepository } from '@/core/database/repositories/documentRepository';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import type { DocumentRecord, FolderRecord } from '@/core/document-engine/model';
import { useFeature } from '@/core/config/remoteConfig';
import { useSettings } from '@/core/config/settingsStore';
import { openScanner } from '@/features/home/HomeScreen';
import { useDocuments } from './documentsStore';
import { DocumentListItem } from './DocumentListItem';
import { DocumentGridItem } from './DocumentGridItem';
import { useDocumentActions } from './useDocumentActions';

type Filter = 'all' | 'folders' | 'recent';

/**
 * Document manager: filter chips, list or grid, long press to select several documents
 * (move / delete), the per-document menu as a bottom sheet, pull to refresh.
 */
export function DocumentsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'move' | 'delete' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const view = useSettings((s) => s.documentsView);
  const setView = useSettings((s) => s.setDocumentsView);
  const trashEnabled = useFeature('trash');
  const { documents, folders, refresh } = useDocuments();
  const actions = useDocumentActions();
  const selecting = selected.size > 0;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Android back leaves selection mode before leaving the screen.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelected(new Set());
        return true;
      });
      return () => sub.remove();
    }, [selecting]),
  );

  const recent = useMemo(
    () => [...documents].sort((a, b) => (b.openedAt ?? b.updatedAt) - (a.openedAt ?? a.updatedAt)).slice(0, 30),
    [documents],
  );

  const toggle = useCallback((d: DocumentRecord) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(d.id)) next.delete(d.id);
      else next.add(d.id);
      return next;
    });
  }, []);
  const startSelect = useCallback(
    (d: DocumentRecord) => {
      haptics.long();
      toggle(d);
    },
    [toggle],
  );
  const openDoc = useCallback(
    (d: DocumentRecord) => (selecting ? toggle(d) : router.push({ pathname: '/document/[id]', params: { id: d.id } })),
    [selecting, toggle],
  );
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  const selectedDocs = () => documents.filter((d) => selected.has(d.id));

  const docs = filter === 'recent' ? recent : documents;
  const header = selecting ? (
    <TTopAppBar
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginStart: -spacing.sm }}>
          <TIconButton icon="close" accessibilityLabel={t('documents.clear_selection')} onPress={() => setSelected(new Set())} size={48} />
          <TText variant="title" accessibilityLiveRegion="polite">
            {t('documents.selected', { count: selected.size })}
          </TText>
        </View>
      }
      actions={[
        { icon: 'selectAll', label: t('documents.select_all'), onPress: () => setSelected(new Set(docs.map((d) => d.id))) },
        ...(folders.length ? [{ icon: 'folder' as const, label: t('documents.move'), onPress: () => setBulk('move') }] : []),
        { icon: 'delete', label: t('documents.delete'), onPress: () => setBulk('delete') },
      ]}
    />
  ) : (
    <TTopAppBar
      title={t('documents.title')}
      actions={[
        { icon: 'search', label: t('documents.search_placeholder'), onPress: () => router.push('/search') },
        view === 'list'
          ? { icon: 'grid', label: t('documents.view_grid'), onPress: () => setView('grid') }
          : { icon: 'list', label: t('documents.view_list'), onPress: () => setView('list') },
        { icon: 'folderAdd', label: t('documents.create_folder'), onPress: () => setNewFolder('') },
      ]}
    />
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} />;

  return (
    <TScreen surface="container" header={header}>
      {!selecting ? (
        <TChipRow>
          <TChip testID="chip-all" label={t('documents.tab_all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <TChip testID="chip-folders" label={t('documents.tab_folders')} icon="folder" selected={filter === 'folders'} onPress={() => setFilter('folders')} />
          <TChip testID="chip-recent" label={t('documents.tab_recent')} icon="recent" selected={filter === 'recent'} onPress={() => setFilter('recent')} />
        </TChipRow>
      ) : null}

      {filter === 'folders' ? (
        <FlatList<FolderRecord>
          data={folders}
          keyExtractor={(f) => f.id}
          refreshControl={refreshControl}
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
          ListEmptyComponent={
            <View testID="folders-empty" style={{ alignItems: 'center', paddingTop: 96, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
              <TIcon name="folder" size={48} color={colors.textPlaceholder} strokeWidth={1.5} />
              <TText variant="bodyLarge" color="textSecondary" align="center">
                {t('documents.folders_empty')}
              </TText>
              <TButton label={t('documents.create_folder')} icon="plus" variant="secondary" size="medium" onPress={() => setNewFolder('')} style={{ marginTop: spacing.xs, borderRadius: 20 }} />
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      ) : (
        <FlatList<DocumentRecord>
          key={view}
          data={docs}
          numColumns={view === 'grid' ? 2 : 1}
          keyExtractor={(d) => d.id}
          refreshControl={refreshControl}
          // Virtualised (spec §52): thumbnails are small cached JPEGs, PDFs are never loaded here.
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          columnWrapperStyle={view === 'grid' ? { paddingHorizontal: spacing.xs, gap: spacing.xxs } : undefined}
          ItemSeparatorComponent={view === 'list' ? () => <TDivider inset={spacing.md + 44 + spacing.sm} /> : undefined}
          renderItem={({ item }) => {
            const Item = view === 'grid' ? DocumentGridItem : DocumentListItem;
            return (
              <Item doc={item} onPress={openDoc} onMore={actions.open} onLongPress={selecting ? toggle : startSelect} selected={selected.has(item.id)} selecting={selecting} />
            );
          }}
          ListEmptyComponent={
            <TEmpty icon="documents" title={t('documents.empty')} description={t('documents.empty_hint')} actionLabel={t('home.scan_document')} onAction={() => openScanner({ source: 'documents_empty' })} />
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.lg }}
        />
      )}
      {actions.element}

      <TActionSheet
        visible={bulk === 'move'}
        title={t('documents.move')}
        cancelLabel={t('common.cancel')}
        onClose={() => setBulk(null)}
        items={folders.map((f) => ({ key: f.id, label: f.systemKey ? t(`folders.${f.systemKey}`) : f.name, icon: 'folder' as const }))}
        onSelect={async (folderId) => {
          setBulk(null);
          for (const d of selectedDocs()) await documentRepository.move(d.id, folderId);
          setSelected(new Set());
          await refresh();
        }}
      />
      <TDialog
        visible={bulk === 'delete'}
        title={t('documents.delete_many_title')}
        content={trashEnabled ? undefined : t('documents.delete_forever_body')}
        onRequestClose={() => setBulk(null)}
        actions={[
          {
            label: t(trashEnabled ? 'documents.delete' : 'documents.delete_permanent'),
            tone: 'danger',
            onPress: async () => {
              const docsToDelete = selectedDocs();
              setBulk(null);
              for (const d of docsToDelete) {
                if (trashEnabled) await DocumentEngine.moveToTrash(d.id);
                else await DocumentEngine.deletePermanently(d);
              }
              setSelected(new Set());
              await refresh();
              toast(t('documents.deleted_many', { count: docsToDelete.length }));
            },
          },
          { label: t('common.cancel'), onPress: () => setBulk(null) },
        ]}
      />
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
                setFilter('folders');
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
