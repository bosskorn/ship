import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TDivider, TEmpty, TIcon, TIconButton, TScreen, TSearch, TText, useTheme } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import type { DocumentRecord } from '@/core/document-engine/model';
import { DocumentListItem } from '@/features/documents/DocumentListItem';
import { track } from '@/services/analytics/analytics';

/** Local-first search (spec §34): the query never leaves the device. */
export function SearchScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentRecord[] | null>(null);

  const trimmed = query.trim();
  const shown = trimmed ? results : null;

  useEffect(() => {
    const q = trimmed;
    if (!q) return;
    const handle = setTimeout(() => {
      documentRepository
        .search(q)
        .then((r) => {
          setResults(r);
          track('search_used', { results: r.length });
        })
        .catch(() => setResults([]));
    }, 180);
    return () => clearTimeout(handle);
  }, [trimmed]);

  return (
    <TScreen
      surface="container"
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingRight: spacing.md, paddingVertical: spacing.xs }}>
          <TIconButton icon="back" accessibilityLabel={t('common.back')} onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <TSearch testID="search-input" placeholder={t('search.placeholder')} value={query} onChangeText={setQuery} autoFocus />
          </View>
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
          ItemSeparatorComponent={() => <TDivider inset={spacing.md + 44 + spacing.sm} />}
          renderItem={({ item }) => <DocumentListItem doc={item} onPress={(d) => router.push({ pathname: '/document/[id]', params: { id: d.id } })} />}
          ListEmptyComponent={<TEmpty icon="search" title={t('search.no_results')} />}
        />
      )}
    </TScreen>
  );
}
