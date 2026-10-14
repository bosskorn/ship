import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TDivider, TEmpty, TIconButton, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { MAX_DOCUMENT_PAGES, movePage } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentTypeBadge, useDocumentMeta } from '@/features/documents/DocumentListItem';
import { usePageWorkspace } from './pageWorkspace';

function Row({ doc, order, onPress, onUp, onDown }: { doc: DocumentRecord; order: number | null; onPress: () => void; onUp?: () => void; onDown?: () => void }) {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const meta = useDocumentMeta(doc);
  return (
    <Pressable
      testID={`merge-${doc.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: order !== null }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingStart: spacing.md, paddingEnd: spacing.xxs, minHeight: 64, backgroundColor: order !== null ? colors.brandLight : pressed ? colors.bgPressed : colors.bgContainer })}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: order !== null ? 0 : 2, borderColor: colors.border, backgroundColor: order !== null ? colors.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {order !== null ? (
          <TText variant="bodySmall" weight="700" style={{ color: colors.textAnti }}>
            {order}
          </TText>
        ) : null}
      </View>
      <DocumentTypeBadge doc={doc} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <TText variant="bodyLarge" numberOfLines={1}>
          {doc.title}
        </TText>
        <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
          {meta}
        </TText>
      </View>
      {order !== null ? (
        <View style={{ flexDirection: 'row' }}>
          <TIconButton icon="chevronUp" accessibilityLabel={t('pages.move_earlier')} disabled={!onUp} onPress={() => onUp?.()} size={40} />
          <TIconButton icon="chevronDown" accessibilityLabel={t('pages.move_later')} disabled={!onDown} onPress={() => onDown?.()} size={40} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Merge PDF, step 1: choose documents in merge order (and reorder them). Step 2 is the Page
 * Manager with every page: drag to reorder, preview, then save as a new document.
 * The documents being merged are never changed.
 */
export function MergeScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { spacing, colors } = useTheme();
  const documents = useDocuments((s) => s.documents).filter((d) => d.pageCount > 0);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const chosen = order.map((id) => documents.find((d) => d.id === id)).filter((d): d is DocumentRecord => !!d);
  const total = chosen.reduce((n, d) => n + d.pageCount, 0);
  // Chosen documents first, in merge order; then the rest.
  const list = [...chosen, ...documents.filter((d) => !order.includes(d.id))];

  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const next = async () => {
    if (chosen.length < 2) return toast(t('merge.need_two'), 'info');
    if (total > MAX_DOCUMENT_PAGES) return toast(t('pages.limit', { count: MAX_DOCUMENT_PAGES }), 'info');
    setLoading(true);
    try {
      const items = [];
      for (const d of chosen) items.push(...(await DocumentPageService.fromDocument(d)));
      usePageWorkspace.getState().open({ purpose: 'merge', items, docType: 'document' });
      router.replace('/pages');
    } catch {
      toast(t('merge.load_failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TScreen
      surface="container"
      header={<TNavigationBar title={t('merge.title')} onBack={() => router.back()} />}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
          <TText testID="merge-summary" variant="body" color="textSecondary" style={{ flex: 1 }}>
            {chosen.length ? `${t('documents.selected', { count: chosen.length })} · ${t('merge.pages_total', { count: total })}` : t('merge.need_two')}
          </TText>
          <TButton testID="merge-next" label={t('merge.next')} loading={loading} disabled={chosen.length < 2 || loading} onPress={() => void next()} />
        </View>
      }
    >
      <TText variant="body" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        {t('merge.pick_hint')}
      </TText>
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        ItemSeparatorComponent={() => <TDivider inset={spacing.md + 28 + 40 + spacing.sm * 2} />}
        renderItem={({ item }) => {
          const i = order.indexOf(item.id);
          return (
            <Row
              doc={item}
              order={i >= 0 ? i + 1 : null}
              onPress={() => toggle(item.id)}
              onUp={i > 0 ? () => setOrder((o) => movePage(o, i, i - 1)) : undefined}
              onDown={i >= 0 && i < order.length - 1 ? () => setOrder((o) => movePage(o, i, i + 1)) : undefined}
            />
          );
        }}
        ListEmptyComponent={<TEmpty icon="documents" title={t('pages.no_documents')} />}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </TScreen>
  );
}
