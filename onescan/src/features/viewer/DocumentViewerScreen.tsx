import React, { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconName, TActionSheet, TEmpty, TIcon, TIconButton, TLoading, TNavigationBar, TText, useTheme, useToast,
} from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import type { PageRecord } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { useDocument } from './useDocument';
import { useScanSession } from '@/features/scanner/scanSession';

export function DocumentViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { doc, pages } = useDocument(id);
  const actions = useDocumentActions();
  const [current, setCurrent] = useState(0);
  const [more, setMore] = useState(false);

  if (doc === undefined) return <View style={{ flex: 1, backgroundColor: colors.bgPage, paddingTop: insets.top }}><TLoading /></View>;
  if (doc === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPage, paddingTop: insets.top }}>
        <TNavigationBar onBack={() => router.back()} />
        <TEmpty icon="documents" title={t('viewer.not_found')} />
      </View>
    );
  }

  const share = async () => {
    try {
      if (!(await DocumentEngine.export.isShareAvailable())) return toast(t('errors.share_unavailable'), 'error');
      await DocumentEngine.share(doc);
      track('pdf_exported', { pages: doc.pageCount });
    } catch {
      toast(t('errors.generic'), 'error');
    }
  };

  const bottom: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'share', label: t('viewer.share'), icon: 'share', onPress: share },
    {
      key: 'ai',
      label: t('viewer.ai'),
      icon: 'ai',
      onPress: () => {
        track('ai_clicked', { source: 'viewer' });
        router.push({ pathname: '/ai-consent', params: { id: doc.id, task: 'summary' } });
      },
    },
    { key: 'convert', label: t('viewer.convert'), icon: 'convert', onPress: () => router.push('/tools') },
    { key: 'more', label: t('viewer.more'), icon: 'more', onPress: () => setMore(true) },
  ];

  const pageHeight = (p: PageRecord) => Math.round(((width - spacing.md * 2) * p.height) / Math.max(1, p.width));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPage, paddingTop: insets.top }}>
      <TNavigationBar
        title={doc.title}
        onBack={() => router.back()}
        backLabel={t('common.back')}
        divider
        right={
          <>
            <TIconButton icon="search" accessibilityLabel={t('viewer.search')} onPress={() => router.push({ pathname: '/ocr/[id]', params: { id: doc.id } })} />
            {pages.length ? (
              <TIconButton
                icon="edit"
                accessibilityLabel={t('viewer.edit')}
                onPress={async () => {
                  useScanSession.getState().edit(doc.id, await DocumentEngine.draftsFor(doc.id));
                  router.push('/editor');
                }}
              />
            ) : null}
          </>
        }
      />

      {pages.length ? (
        <FlatList
          data={pages}
          keyExtractor={(p) => p.id}
          // Page-by-page lazy rendering (spec §52–53).
          initialNumToRender={2}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          onViewableItemsChanged={({ viewableItems }) => {
            const first = viewableItems[0]?.index;
            if (typeof first === 'number') setCurrent(first);
          }}
          renderItem={({ item }) => (
            <Image source={{ uri: item.imageUri }} resizeMode="contain" style={{ width: '100%', height: pageHeight(item), backgroundColor: colors.bgContainer }} />
          )}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TEmpty icon="importPdf" title={doc.title} description={t('documents.pdf')} actionLabel={t('viewer.share')} onAction={share} />
        </View>
      )}

      {pages.length > 1 ? (
        <View style={[styles.counter, { backgroundColor: colors.mediaOverlay, borderRadius: radius.md, bottom: 72 + insets.bottom }]}>
          <TText variant="bodySmall" color="mediaText">
            {t('viewer.page_of', { current: current + 1, total: pages.length })}
          </TText>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', backgroundColor: colors.bgContainer, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingBottom: insets.bottom }}>
        {bottom.map((b) => (
          <Pressable key={b.key} testID={`viewer-${b.key}`} accessibilityRole="button" onPress={b.onPress} style={{ flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <TIcon name={b.icon} size="md" />
            <TText variant="caption" color="textSecondary">
              {b.label}
            </TText>
          </Pressable>
        ))}
      </View>

      <TActionSheet
        visible={more}
        title={doc.title}
        cancelLabel={t('common.cancel')}
        onClose={() => setMore(false)}
        onSelect={(key) => {
          setMore(false);
          if (key === 'ocr') router.push({ pathname: '/ocr/[id]', params: { id: doc.id } });
          else if (key === 'sensitive') router.push({ pathname: '/sensitive/[id]', params: { id: doc.id } });
          else if (key === 'manage') actions.open(doc);
        }}
        items={[
          { key: 'ocr', label: t('viewer.ocr'), icon: 'ocr' },
          { key: 'sensitive', label: t('sensitive.review'), icon: 'shield' },
          { key: 'manage', label: t('common.more'), icon: 'more' },
        ]}
      />
      {actions.element}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4 },
});
