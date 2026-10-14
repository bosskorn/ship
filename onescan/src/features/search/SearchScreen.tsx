import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TEmpty, TIcon, TIconButton, TScreen, TText, useTheme } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
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

  const trimmed = query.trim();
  const shown = trimmed ? results : null;

  useEffect(() => {
    const q = trimmed;
    if (!q) return;
    let alive = true;
    const handle = setTimeout(() => {
      documentRepository
        .search(q)
        .then(async (r) => {
          if (!alive) return;
          setResults(r);
          track('search_used', { results: r.length });
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
  }, [trimmed]);

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
            style={{ flex: 1, fontSize: 16, color: colors.textPrimary, fontFamily, paddingVertical: 0 }}
          />
          {query ? <TIconButton icon="close" accessibilityLabel={t('search.clear')} onPress={() => setQuery('')} size={44} /> : null}
        </View>
      }
    >
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
