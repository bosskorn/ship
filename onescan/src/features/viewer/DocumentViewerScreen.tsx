import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconName, TActionSheet, TEmpty, TIcon, TIconButton, TNavigationBar, TText, useTheme, useToast,
} from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import type { PageRecord } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';
import { useDocuments } from '@/features/documents/documentsStore';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { useDocument } from './useDocument';
import { PageZoomView } from './PageZoomView';
import { useScanSession } from '@/features/scanner/scanSession';
import { useFeature } from '@/core/config/remoteConfig';
import { SecureImage } from '@/features/shared/SecureImage';

export function DocumentViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const aiEnabled = useFeature('ai');
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { doc, pages, loading } = useDocument(id);
  const pageWidth = width - spacing.xl * 2;
  // Pages rendered from an imported PDF keep the render itself as their source.
  const importedPdf = pages.length > 0 && pages.every((p) => p.sourceUri === p.imageUri && p.filter === 'original');
  const actions = useDocumentActions({ inViewer: true });
  const [current, setCurrent] = useState(0);
  const [more, setMore] = useState(false);
  const [zoomPage, setZoomPage] = useState<PageRecord | null>(null);
  // FlatList requires the same callback for its whole life.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    const first = viewableItems[0]?.index;
    if (typeof first === 'number') setCurrent(first);
  });

  if (doc === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgSecondary, paddingTop: insets.top }}>
        <TNavigationBar onBack={() => router.back()} title="" />
        <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 48, alignItems: 'center' }}>
          <View
            style={{
              width: pageWidth,
              height: Math.min(pageWidth * 1.414, 460),
              backgroundColor: colors.bgContainer,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.divider,
              opacity: 0.6,
            }}
          />
        </View>
      </View>
    );
  }
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

  const canEdit = pages.length > 0 && !importedPdf;
  const edit = async () => {
    useScanSession.getState().edit(doc.id, await DocumentEngine.draftsFor(doc.id));
    router.push('/editor');
  };

  // Design V2: Share · Edit · Text · More. Only actions that work are shown (AI behind its flag;
  // imported PDFs are not editable — editing would replace the original PDF with page images).
  const bottom: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'share', label: t('viewer.share'), icon: 'share', onPress: share },
    ...(canEdit ? [{ key: 'edit', label: t('viewer.edit'), icon: 'edit' as IconName, onPress: () => void edit() }] : []),
    ...(pages.length ? [{ key: 'text', label: t('viewer.text'), icon: 'ocr' as IconName, onPress: () => router.push({ pathname: '/ocr/[id]', params: { id: doc.id } }) }] : []),
    ...(aiEnabled
      ? [
          {
            key: 'ai',
            label: t('viewer.ai'),
            icon: 'ai' as IconName,
            onPress: () => {
              track('ai_clicked', { source: 'viewer' });
              router.push({ pathname: '/ai-consent', params: { id: doc.id, task: 'summary' } });
            },
          },
        ]
      : []),
    { key: 'more', label: t('viewer.more'), icon: 'more', onPress: () => setMore(true) },
  ];

  const pageHeight = (p: PageRecord) => Math.round((pageWidth * p.height) / Math.max(1, p.width));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary, paddingTop: insets.top }}>
      <TNavigationBar
        title={doc.title}
        onBack={() => router.back()}
        backLabel={t('common.back')}
        right={
          <>
            <TIconButton icon="search" accessibilityLabel={t('viewer.search')} onPress={() => router.push({ pathname: '/ocr/[id]', params: { id: doc.id } })} />
            <TIconButton icon="more" accessibilityLabel={t('common.more')} onPress={() => actions.open(useDocuments.getState().documents.find((d) => d.id === doc.id) ?? doc)} />
          </>
        }
      />

      {loading && pages.length === 0 ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 48, alignItems: 'center' }}>
          <View
            style={{
              width: pageWidth,
              height: Math.min(pageWidth * 1.414, 460),
              backgroundColor: colors.bgContainer,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.divider,
              opacity: 0.6,
            }}
          />
        </View>
      ) : pages.length ? (
        <FlatList
          data={pages}
          keyExtractor={(p) => p.id}
          // Page-by-page lazy rendering (spec §52–53).
          initialNumToRender={2}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 48, paddingBottom: spacing.xl, gap: spacing.lg }}
          onViewableItemsChanged={onViewable}
          renderItem={({ item, index }) => (
            // Preview for scrolling; tapping opens the full-resolution master with zoom.
            <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('viewer.zoom_page', { page: index + 1 })} onPress={() => setZoomPage(item)}>
              <View style={{ borderRadius: 3, backgroundColor: '#FFFFFF', elevation: 5, shadowColor: '#0F1521', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
                <SecureImage uri={item.previewUri ?? item.imageUri} resizeMode="contain" style={{ width: pageWidth, height: pageHeight(item), borderRadius: 3 }} />
              </View>
            </Pressable>
          )}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TEmpty icon="importPdf" title={doc.title} description={t('documents.pdf')} actionLabel={t('viewer.share')} onAction={share} />
        </View>
      )}

      {pages.length > 1 ? (
        <View style={[styles.counter, { backgroundColor: colors.bgContainer, borderColor: colors.border, top: insets.top + 56 + 10 }]} pointerEvents="none">
          <TText variant="bodySmall" color="textSecondary">
            {t('viewer.page_of', { current: current + 1, total: pages.length })}
          </TText>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', backgroundColor: colors.bgContainer, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingBottom: insets.bottom }}>
        {bottom.map((b) => (
          <Pressable key={b.key} testID={`viewer-${b.key}`} accessibilityRole="button" onPress={b.onPress} style={{ flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
          if (key === 'sensitive') router.push({ pathname: '/sensitive/[id]', params: { id: doc.id } });
          else if (key === 'manage') actions.open(doc);
        }}
        items={[
          { key: 'sensitive', label: t('sensitive.review'), icon: 'shield' },
          { key: 'manage', label: t('common.more'), icon: 'more' },
        ]}
      />
      {actions.element}
      <PageZoomView page={zoomPage} onClose={() => setZoomPage(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
