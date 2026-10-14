import React, { useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TActionSheet, TChip, TChipRow, TEmpty, TIcon, TIconButton, TScreen, TText, useTheme } from '@/design-system';
import { documentRepository, SearchFilters } from '@/core/database/repositories/documentRepository';
import { useDocuments } from '@/features/documents/documentsStore';
import type { DocumentRecord, DocumentType } from '@/core/document-engine/model';
import { DocumentThumb, useDocumentMeta } from '@/features/documents/DocumentListItem';
import { track } from '@/services/analytics/analytics';
import { matchSnippet, Snippet } from './snippet';

function Result({ doc, snippet }: { doc: DocumentRecord; snippet: Snippet | null }) {
  const { colors, spacing } = useTheme();
  const meta = useDocumentMeta(doc);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: doc.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.bgPressed : 'transparent' })}
    >
      <DocumentThumb doc={doc} width={52} height={68} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <TText variant="bodyLarge" weight="500" numberOfLines={1}>
          {doc.title}
        </TText>
        {snippet ? (
          <TText variant="body" color="textSecondary" numberOfLines={2}>
            {snippet.before}
            <TText variant="body" weight="600" style={{ color: colors.brand, backgroundColor: colors.brandLight }}>
              {snippet.match}
            </TText>
            {snippet.after}
          </TText>
        ) : null}
        <TText variant="bodySmall" color="textPlaceholder" numberOfLines={1}>
          {meta}
        </TText>
      </View>
    </Pressable>
  );
}

type DateRange = '7' | '30' | 'year';
interface Filters {
  docType?: DocumentType;
  date?: DateRange;
  folderId?: string;
  tagId?: string;
  favorite?: boolean;
}
const TYPES: DocumentType[] = ['document', 'id_card', 'receipt'];

/** Date filter → created_at range on this device's clock. */
export function dateRange(d: DateRange | undefined, now = Date.now()): Pick<SearchFilters, 'from' | 'to'> {
  if (!d) return {};
  if (d === 'year') return { from: new Date(new Date(now).getFullYear(), 0, 1).getTime() };
  return { from: now - Number(d) * 86_400_000 };
}

/**
 * Local-first search (spec §34): the query never leaves the device. Each result shows why
 * it matched: the text around the first matching word, read from the document's OCR text.
 */
export function SearchScreen() {
  const { t } = useTranslation();
  const { colors, spacing, fontFamily } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentRecord[] | null>(null);
  const [snippets, setSnippets] = useState<Record<string, Snippet | null>>({});
  const [filters, setFilters] = useState<Filters>({});
  const [picker, setPicker] = useState<'type' | 'date' | 'folder' | 'tag' | null>(null);
  const folders = useDocuments((s) => s.folders);
  const tags = useDocuments((s) => s.tags);

  const trimmed = query.trim();
  const filtering = !!(filters.docType || filters.date || filters.folderId || filters.tagId || filters.favorite);
  const active = !!trimmed || filtering;
  const shown = active ? results : null;
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    const q = trimmed;
    if (!q && !filtering) return;
    let alive = true;
    const f: Filters = JSON.parse(filterKey);
    const handle = setTimeout(() => {
      documentRepository
        .search(q, 100, { docType: f.docType, folderId: f.folderId, tagId: f.tagId, favorite: f.favorite, ...dateRange(f.date) })
        .then(async (r) => {
          if (!alive) return;
          setResults(r);
          track('search_used', { results: r.length });
          if (!q) return setSnippets({});
          // Snippets for the first screenful of results, from text already on the device.
          const entries = await Promise.all(
            r.slice(0, 30).map(async (d) => [d.id, matchSnippet(await documentRepository.ocrText(d.id).catch(() => ''), q)] as const),
          );
          if (alive) setSnippets(Object.fromEntries(entries));
        })
        .catch(() => alive && setResults([]));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [trimmed, filtering, filterKey]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const folderName = (id: string) => {
    const f = folders.find((x) => x.id === id);
    return f ? (f.systemKey ? t(`folders.${f.systemKey}`) : f.name) : '';
  };
  const sheet: Record<'type' | 'date' | 'folder' | 'tag', { title: string; items: { key: string; label: string }[]; apply: (k: string) => void }> = {
    type: {
      title: t('search_filters.type'),
      items: [{ key: '', label: t('search_filters.any') }, ...TYPES.map((x) => ({ key: x, label: t(`doc_types.${x}`) }))],
      apply: (k) => set({ docType: (k || undefined) as DocumentType | undefined }),
    },
    date: {
      title: t('search_filters.date'),
      items: [
        { key: '', label: t('search_filters.any') },
        { key: '7', label: t('search_filters.last_7') },
        { key: '30', label: t('search_filters.last_30') },
        { key: 'year', label: t('search_filters.this_year') },
      ],
      apply: (k) => set({ date: (k || undefined) as DateRange | undefined }),
    },
    folder: {
      title: t('search_filters.folder'),
      items: [{ key: '', label: t('search_filters.any') }, ...folders.map((f) => ({ key: f.id, label: folderName(f.id) }))],
      apply: (k) => set({ folderId: k || undefined }),
    },
    tag: {
      title: t('search_filters.tag'),
      items: [{ key: '', label: t('search_filters.any') }, ...tags.map((x) => ({ key: x.id, label: x.name }))],
      apply: (k) => set({ tagId: k || undefined }),
    },
  };
  const dateLabel = filters.date ? { '7': t('search_filters.last_7'), '30': t('search_filters.last_30'), year: t('search_filters.this_year') }[filters.date] : null;

  return (
    <TScreen
      surface="container"
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 52, marginHorizontal: spacing.sm, marginVertical: spacing.xs, borderRadius: 26, backgroundColor: colors.bgSecondary, paddingHorizontal: spacing.xxs }}>
          <TIconButton icon="back" accessibilityLabel={t('common.back')} onPress={() => router.back()} size={44} />
          <TextInput
            testID="search-input"
            accessibilityRole="search"
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textPlaceholder}
            returnKeyType="search"
            style={[
              { flex: 1, fontSize: 16, color: colors.textPrimary, fontFamily, paddingVertical: 0 },
              Platform.select({ android: { includeFontPadding: false } }),
            ]}
          />
          {query ? <TIconButton icon="close" accessibilityLabel={t('search.clear')} onPress={() => setQuery('')} size={44} /> : null}
        </View>
      }
    >
      <TChipRow>
        <TChip testID="filter-favorite" label={t('search_filters.favorite')} icon="star" selected={!!filters.favorite} onPress={() => set({ favorite: !filters.favorite })} />
        <TChip testID="filter-type" label={filters.docType ? t(`doc_types.${filters.docType}`) : t('search_filters.type')} icon="documents" selected={!!filters.docType} onPress={() => setPicker('type')} />
        <TChip testID="filter-date" label={dateLabel ?? t('search_filters.date')} icon="calendar" selected={!!filters.date} onPress={() => setPicker('date')} />
        {folders.length ? (
          <TChip testID="filter-folder" label={filters.folderId ? folderName(filters.folderId) : t('search_filters.folder')} icon="folder" selected={!!filters.folderId} onPress={() => setPicker('folder')} />
        ) : null}
        {tags.length ? (
          <TChip testID="filter-tag" label={filters.tagId ? (tags.find((x) => x.id === filters.tagId)?.name ?? t('search_filters.tag')) : t('search_filters.tag')} icon="tag" selected={!!filters.tagId} onPress={() => setPicker('tag')} />
        ) : null}
        {filtering ? <TChip testID="filter-clear" label={t('search_filters.clear')} icon="close" onPress={() => setFilters({})} /> : null}
      </TChipRow>
      <TActionSheet
        visible={picker !== null}
        title={picker ? sheet[picker].title : undefined}
        cancelLabel={t('common.cancel')}
        onClose={() => setPicker(null)}
        items={picker ? sheet[picker].items : []}
        onSelect={(k) => {
          if (picker) sheet[picker].apply(k);
          setPicker(null);
        }}
      />
      {shown === null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md }}>
          <TIcon name="offline" size="sm" color={colors.textPlaceholder} />
          <TText variant="bodySmall" color="textPlaceholder">
            {t('search.local_note')}
          </TText>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(d) => d.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            shown.length ? (
              <TText variant="bodySmall" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xxs, paddingBottom: spacing.xxs }}>
                {t('search.found', { count: shown.length })}
              </TText>
            ) : null
          }
          renderItem={({ item }) => <Result doc={item} snippet={snippets[item.id] ?? null} />}
          ListEmptyComponent={<TEmpty icon="search" title={t('search.no_results')} />}
        />
      )}
    </TScreen>
  );
}
