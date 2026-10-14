import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
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

/** `tag:<id>` = documents carrying that tag. */
type Filter = 'all' | 'folders' | 'recent' | 'favorites' | `tag:${string}`;

function DocumentsSkeleton({ view }: { view: 'list' | 'grid' }) {
  const { colors, spacing } = useTheme();
  if (view === 'grid') {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.xs, gap: spacing.xxs, paddingTop: spacing.xs }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={{ width: '48.5%', height: 210, borderRadius: 8, backgroundColor: colors.bgSecondary, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.divider }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={{ height: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 44, height: 56, borderRadius: 4, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.divider }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '60%', height: 14, borderRadius: 4, backgroundColor: colors.bgSecondary }} />
            <View style={{ width: '35%', height: 10, borderRadius: 4, backgroundColor: colors.bgSecondary }} />
          </View>
        </View>
      ))}
    </View>
  );
}

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
  const [bulk, setBulk] = useState<'move' | 'delete' | 'no_folders' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const view = useSettings((s) => s.documentsView);
  const setView = useSettings((s) => s.setDocumentsView);
  const trashEnabled = useFeature('trash');
  const { documents, folders, tags, tagMap, refresh, loaded } = useDocuments();
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

  // A tag filter whose tag was deleted shows all documents.
  const rawTag = filter.startsWith('tag:') ? filter.slice(4) : null;
  const tagFilter = rawTag && tags.some((x) => x.id === rawTag) ? rawTag : null;
  const active: Filter = rawTag && !tagFilter ? 'all' : filter;
  const docs = useMemo(
    () =>
      active === 'recent'
        ? recent
        : active === 'favorites'
          ? documents.filter((d) => d.isFavorite)
          : tagFilter
            ? documents.filter((d) => tagMap[d.id]?.includes(tagFilter))
            : documents,
    [active, recent, documents, tagFilter, tagMap],
  );
  const [selectionMenu, setSelectionMenu] = useState(false);

  // The share engine shares one document at a time: Share is enabled only for a single selection.
  const canShare = selected.size === 1;
  const onBulkShare = async () => {
    const chosen = selectedDocs();
    if (chosen.length !== 1) return;
    try {
      if (!(await DocumentEngine.export.isShareAvailable())) return toast(t('errors.share_unavailable'), 'error');
      await DocumentEngine.share(chosen[0]);
    } catch {
      toast(t('errors.generic'), 'error');
    }
  };
  // No folders yet: explain and offer to create one instead of opening an empty menu.
  const onBulkMove = () => setBulk(folders.length ? 'move' : 'no_folders');

  const selectionBar = selecting ? (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 60,
        backgroundColor: colors.bgContainer,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
      }}
    >
      <Pressable
        testID="selection-share"
        accessibilityRole="button"
        accessibilityLabel={canShare ? t('documents.share') : `${t('documents.share')} · ${t('documents.share_one_only')}`}
        accessibilityState={{ disabled: !canShare }}
        onPress={onBulkShare}
        disabled={!canShare}
        style={({ pressed }) => ({ alignItems: 'center', opacity: !canShare ? 0.38 : pressed ? 0.6 : 1, minWidth: 64, gap: 2 })}
      >
        <TIcon name="share" size="md" color={colors.textPrimary} />
        <TText variant="caption" color="textSecondary">
          {t('documents.share')}
        </TText>
      </Pressable>
      <Pressable
        testID="selection-move"
        accessibilityRole="button"
        accessibilityLabel={t('documents.move')}
        onPress={onBulkMove}
        disabled={selected.size === 0}
        style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1, minWidth: 64, gap: 2 })}
      >
        <TIcon name="folder" size="md" color={colors.textPrimary} />
        <TText variant="caption" color="textSecondary">
          {t('documents.move')}
        </TText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('documents.delete')}
        onPress={() => setBulk('delete')}
        disabled={selected.size === 0}
        style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1, minWidth: 64, gap: 2 })}
      >
        <TIcon name="delete" size="md" color={colors.error} />
        <TText variant="caption" color="error">
          {t('documents.delete')}
        </TText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.more')}
        onPress={() => setSelectionMenu(true)}
        disabled={selected.size === 0}
        style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1, minWidth: 64, gap: 2 })}
      >
        <TIcon name="more" size="md" color={colors.textPrimary} />
        <TText variant="caption" color="textSecondary">
          {t('common.more')}
        </TText>
      </Pressable>
    </View>
  ) : null;

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
    <TScreen surface="container" header={header} footer={selectionBar}>
      {!selecting ? (
        <TChipRow>
          <TChip testID="chip-all" label={t('documents.tab_all')} selected={active === 'all'} onPress={() => setFilter('all')} />
          <TChip testID="chip-folders" label={t('documents.tab_folders')} icon="folder" selected={active === 'folders'} onPress={() => setFilter('folders')} />
          <TChip testID="chip-recent" label={t('documents.tab_recent')} icon="recent" selected={active === 'recent'} onPress={() => setFilter('recent')} />
          <TChip testID="chip-favorites" label={t('documents.tab_favorites')} icon="star" selected={active === 'favorites'} onPress={() => setFilter('favorites')} />
          {tags.map((tag) => (
            <TChip key={tag.id} testID={`chip-tag-${tag.name}`} label={tag.name} icon="tag" selected={active === `tag:${tag.id}`} onPress={() => setFilter(`tag:${tag.id}`)} />
          ))}
        </TChipRow>
      ) : null}

      {active === 'folders' ? (
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
            loaded ? (
              <View testID="folders-empty" style={{ alignItems: 'center', paddingTop: 96, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
                <TIcon name="folder" size={48} color={colors.textPlaceholder} strokeWidth={1.5} />
                <TText variant="bodyLarge" color="textSecondary" align="center">
                  {t('documents.folders_empty')}
                </TText>
                <TButton label={t('documents.create_folder')} icon="plus" variant="secondary" size="medium" onPress={() => setNewFolder('')} style={{ marginTop: spacing.xs }} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: colors.bgSecondary }} />
                    <View style={{ width: 140, height: 16, borderRadius: 4, backgroundColor: colors.bgSecondary }} />
                  </View>
                ))}
              </View>
            )
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
            loaded ? (
              active === 'favorites' ? (
                <TEmpty icon="star" title={t('documents.favorites_empty')} description={t('documents.favorites_empty_hint')} />
              ) : tagFilter ? (
                <TEmpty icon="tag" title={t('documents.tag_empty')} />
              ) : (
                <TEmpty icon="documents" title={t('documents.empty')} description={t('documents.empty_hint')} actionLabel={t('home.scan_document')} onAction={() => openScanner({ source: 'documents_empty' })} />
              )
            ) : (
              <DocumentsSkeleton view={view} />
            )
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
        visible={bulk === 'no_folders'}
        title={t('documents.folders_empty')}
        content={t('documents.folders_empty_hint')}
        onRequestClose={() => setBulk(null)}
        actions={[
          { label: t('common.cancel'), onPress: () => setBulk(null) },
          {
            label: t('documents.create_folder'),
            tone: 'primary',
            onPress: () => {
              setBulk(null);
              setNewFolder('');
            },
          },
        ]}
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
      <TActionSheet
        visible={selectionMenu}
        title={t('common.more')}
        cancelLabel={t('common.cancel')}
        onClose={() => setSelectionMenu(false)}
        items={[
          { key: 'selectAll', label: t('documents.select_all'), icon: 'selectAll' },
          ...(selected.size === 1 ? [{ key: 'rename', label: t('common.rename'), icon: 'edit' as const }] : []),
          { key: 'duplicate', label: t('documents.duplicate'), icon: 'duplicate' },
        ]}
        onSelect={async (key) => {
          setSelectionMenu(false);
          if (key === 'selectAll') {
            setSelected(new Set(docs.map((d) => d.id)));
          } else if (key === 'duplicate') {
            for (const d of selectedDocs()) await DocumentEngine.duplicate(d, t('documents.copy_name', { name: d.title }));
            setSelected(new Set());
            await refresh();
          } else if (key === 'rename') {
            const first = selectedDocs()[0];
            if (first) actions.open(first);
          }
        }}
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
