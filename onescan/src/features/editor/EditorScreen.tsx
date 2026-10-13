import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/core/config/settingsStore';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconName, TActionSheet, TDialog, TIcon, TLoading, TNavigationBar, TProgress, TText, useTheme, useToast,
} from '@/design-system';
import { DocumentEngine, SaveStage } from '@/core/document-engine/DocumentEngine';
import { cssFilterFor, pageFilters } from '@/core/document-engine/image/filters';
import type { DraftPage, PageFilter, Quad, Rotation } from '@/core/document-engine/model';
import { formatDateTimeCompact } from '@/core/i18n/format';
import { useScanSession } from '@/features/scanner/scanSession';
import { noteCropAccepted, noteCropCorrected } from '@/features/scanner/cropStats';
import { useDocuments } from '@/features/documents/documentsStore';
import { CropEditor } from './CropEditor';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { track } from '@/services/analytics/analytics';

type Tool = 'crop' | 'rotate' | 'filter' | 'clean' | 'markup' | 'redact';
const tools: { key: Tool; icon: IconName }[] = [
  { key: 'crop', icon: 'crop' },
  { key: 'rotate', icon: 'rotate' },
  { key: 'filter', icon: 'filter' },
  { key: 'clean', icon: 'clean' },
  { key: 'markup', icon: 'markup' },
  { key: 'redact', icon: 'redact' },
];
const filterLabelKey: Record<PageFilter, `editor.filter_${string}`> = {
  original: 'editor.filter_original',
  auto: 'editor.filter_auto',
  card: 'editor.filter_card',
  document: 'editor.filter_document',
  color: 'editor.filter_color',
  gray: 'editor.filter_gray',
  bw: 'editor.filter_bw',
};

/** Preview the chosen filter where the platform supports style filters; PDF output always applies it. */
function previewFilter(page: DraftPage) {
  return DocumentEngine.capture.hasNativeVision() ? undefined : ({ filter: cssFilterFor[page.filter] } as object);
}

export function EditorScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const pager = useRef<FlatList<DraftPage>>(null);
  const { pages, docType, replacePage, removePage, duplicatePage, movePage, setRescan, setFromEditor, clear } = useScanSession();
  const [index, setIndex] = useState(() => Math.max(0, useScanSession.getState().pages.findIndex((p) => p.crop?.decision === 'manual')));
  const [tool, setTool] = useState<Tool | null>(null);
  const [pageMenu, setPageMenu] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState<{ stage: SaveStage; progress: number } | null>(null);
  const [cropping, setCropping] = useState(() => DocumentEngine.capture.hasNativeVision() && useScanSession.getState().pages.some((p) => p.crop?.decision === 'manual'));
  const [working, setWorking] = useState(false);
  const current = pages[Math.min(index, pages.length - 1)];
  const nativeVision = DocumentEngine.capture.hasNativeVision();

  // Auto crop is the default; the crop editor opens by itself only when the crop was not
  // confident enough to apply (it starts from the suggested corners).
  const [firstUnsure] = useState(() => (nativeVision ? pages.findIndex((p) => p.crop?.decision === 'manual') : -1));
  useEffect(() => {
    if (firstUnsure > 0) requestAnimationFrame(() => pager.current?.scrollToIndex({ index: firstUnsure, animated: false }));
  }, [firstUnsure]);

  const goTo = (i: number) => {
    setIndex(i);
    pager.current?.scrollToIndex({ index: i, animated: true });
  };

  const update = async (i: number, patch: { filter?: PageFilter; rotation?: Rotation; quad?: Quad | null }) => {
    setWorking(true);
    try {
      replacePage(i, await DocumentEngine.reprocess(pages[i], patch));
      return true;
    } catch {
      toast(t('errors.generic'), 'error');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const onTool = async (k: Tool) => {
    if (!current || working) return;
    switch (k) {
      case 'rotate':
        return update(index, { rotation: (((current.rotation + 90) % 360) as Rotation) });
      case 'filter':
        return setTool(tool === 'filter' ? null : 'filter');
      case 'crop':
        return nativeVision ? setCropping(true) : toast(t('common.comingSoon'));
      case 'clean':
        // Shadow + background normalisation with document contrast.
        if (await update(index, { filter: 'document' })) toast(t('editor.clean_applied'), 'success');
        return;
      default:
        // Markup ships later; redaction runs on saved documents (Sensitive data screen).
        toast(t('common.comingSoon'));
    }
  };

  const save = async () => {
    if (!pages.length || saving) return;
    setSaving({ stage: 'pdf', progress: 0 });
    try {
      const onStage = (stage: SaveStage, progress: number) => setSaving({ stage, progress });
      const editingId = useScanSession.getState().editingDocumentId;
      const existing = editingId ? await documentRepository.get(editingId) : null;
      const quality = useSettings.getState().scanner.quality;
      const doc = existing
        ? await DocumentEngine.saveEdits(existing, pages, onStage, quality)
        : await DocumentEngine.save(pages, {
            title: t('editor.default_name', { date: formatDateTimeCompact(Date.now(), i18n.language) }),
            docType,
            quality,
            onStage,
          });
      track('scan_completed', { pages: pages.length, doc_type: docType });
      clear();
      await useDocuments.getState().refresh();
      toast(t('editor.saved'), 'success');
      router.replace({ pathname: '/document/[id]', params: { id: doc.id } });
    } catch {
      setSaving(null);
      toast(t('errors.save_failed'), 'error');
    }
  };

  const onPageAction = (key: string) => {
    const i = pageMenu;
    setPageMenu(null);
    if (i === null) return;
    switch (key) {
      case 'left':
        movePage(i, i - 1);
        return setIndex(Math.max(0, i - 1));
      case 'right':
        movePage(i, i + 1);
        return setIndex(Math.min(pages.length - 1, i + 1));
      case 'rotate':
        return update(i, { rotation: (((pages[i].rotation + 90) % 360) as Rotation) });
      case 'duplicate':
        return duplicatePage(i);
      case 'rescan':
        setRescan(i);
        setFromEditor(true);
        return router.push('/scanner');
      case 'delete':
        removePage(i);
        if (pages.length <= 1) {
          clear();
          router.back();
        } else setIndex(Math.max(0, Math.min(i, pages.length - 2)));
    }
  };

  const progressValue = saving ? { pages: 0.05, pdf: 0.2, ocr: 0.3 + saving.progress * 0.6, index: 0.95 }[saving.stage] : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPage, paddingTop: insets.top }}>
      <TNavigationBar
        title={t('editor.title')}
        onBack={() => (pages.length ? setConfirmDiscard(true) : router.back())}
        backLabel={t('common.back')}
        divider
        right={
          <Pressable testID="editor-save" accessibilityRole="button" onPress={save} disabled={!pages.length || !!saving} hitSlop={8} style={{ paddingHorizontal: spacing.sm }}>
            <TText variant="bodyLarge" weight="600" color={pages.length ? 'brand' : 'textDisabled'}>
              {t('common.save')}
            </TText>
          </Pressable>
        }
      />

      {/* Page preview */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={pager}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p.id}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, flex: 1, padding: spacing.md }}>
              <Image
                source={{ uri: item.processedUri }}
                resizeMode="contain"
                style={[{ flex: 1 }, previewFilter(item)]}
              />
            </View>
          )}
        />
        {current?.crop && current.crop.decision !== 'auto' && !current.crop.confirmed && nativeVision ? (
          <View style={styles.cropHint} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.mediaOverlay, borderRadius: 999, paddingLeft: spacing.sm, paddingRight: 4, paddingVertical: 4 }}>
              <TText variant="bodySmall" color="mediaText">
                {current.crop.decision === 'review' ? t('editor.check_edges') : t('editor.no_auto_crop')}
              </TText>
              {current.crop.decision === 'review' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    noteCropAccepted(current);
                    replacePage(index, { ...current, crop: { ...current.crop!, confirmed: true } });
                  }}
                  style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
                >
                  <TText variant="bodySmall" color="textAnti" weight="600">
                    {t('editor.use_this_crop')}
                  </TText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => setCropping(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.mediaText }}
              >
                <TIcon name="crop" size="sm" color={colors.mediaText} />
                <TText variant="bodySmall" color="mediaText">
                  {t('editor.adjust_edges')}
                </TText>
              </Pressable>
            </View>
          </View>
        ) : null}
        {pages.length > 1 ? (
          <View style={[styles.pageBadge, { backgroundColor: colors.mediaOverlay, borderRadius: radius.md }]}>
            <TText variant="bodySmall" color="mediaText">{`${index + 1} / ${pages.length}`}</TText>
          </View>
        ) : null}
      </View>

      {/* Filter strip (progressive disclosure) */}
      {tool === 'filter' && current ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: colors.bgContainer, flexGrow: 0 }} contentContainerStyle={{ padding: spacing.sm, gap: spacing.sm }}>
          {pageFilters.map((f) => {
            const active = current.filter === f;
            return (
              <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => update(index, { filter: f })} style={{ alignItems: 'center', gap: 4 }}>
                <Image
                  source={{ uri: current.processedUri }}
                  style={[{ width: 52, height: 64, borderRadius: radius.sm, borderWidth: 2, borderColor: active ? colors.brand : 'transparent' }, { filter: cssFilterFor[f] } as object]}
                />
                <TText variant="bodySmall" color={active ? 'brand' : 'textSecondary'}>
                  {t(filterLabelKey[f] as 'editor.filter_auto')}
                </TText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Thumbnails: 1 2 3 4 + */}
      <View style={{ backgroundColor: colors.bgContainer, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: spacing.sm, gap: spacing.xs, alignItems: 'center' }}>
          {pages.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={t('editor.page_actions', { index: i + 1 })}
              onPress={() => goTo(i)}
              onLongPress={() => setPageMenu(i)}
              style={{ alignItems: 'center', gap: 2 }}
            >
              <Image source={{ uri: p.processedUri }} style={{ width: 40, height: 52, borderRadius: radius.sm, borderWidth: 2, borderColor: i === index ? colors.brand : colors.divider }} />
              <TText variant="caption" color={i === index ? 'brand' : 'textSecondary'}>
                {String(i + 1)}
              </TText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('editor.add_page')}
            onPress={() => {
              setFromEditor(true);
              router.push('/scanner');
            }}
            style={{ width: 40, height: 52, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}
          >
            <TIcon name="plus" size="md" color={colors.textSecondary} />
          </Pressable>
        </ScrollView>

        {/* Tools */}
        <View style={{ flexDirection: 'row', paddingBottom: insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
          {tools.map((tl) => {
            const active = tool === tl.key;
            return (
              <Pressable key={tl.key} testID={`tool-${tl.key}`} accessibilityRole="button" onPress={() => onTool(tl.key)} style={{ flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <TIcon name={tl.icon} size="md" color={active ? colors.brand : colors.textPrimary} />
                <TText variant="caption" color={active ? 'brand' : 'textSecondary'}>
                  {t(`editor.${tl.key}`)}
                </TText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TActionSheet
        visible={pageMenu !== null}
        title={pageMenu !== null ? t('editor.page_actions', { index: pageMenu + 1 }) : undefined}
        cancelLabel={t('common.cancel')}
        onClose={() => setPageMenu(null)}
        onSelect={onPageAction}
        items={[
          ...(pageMenu ? [{ key: 'left', label: t('editor.move_left'), icon: 'back' as const }] : []),
          ...(pageMenu !== null && pageMenu < pages.length - 1 ? [{ key: 'right', label: t('editor.move_right'), icon: 'chevronRight' as const }] : []),
          { key: 'rotate', label: t('editor.rotate'), icon: 'rotate' },
          { key: 'duplicate', label: t('editor.duplicate_page'), icon: 'duplicate' },
          { key: 'rescan', label: t('editor.rescan_page'), icon: 'rescan' },
          { key: 'delete', label: t('editor.delete_page'), icon: 'delete', danger: true },
        ]}
      />

      <TDialog
        visible={confirmDiscard}
        title={t('editor.discard_title')}
        content={t('editor.discard_body')}
        onRequestClose={() => setConfirmDiscard(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmDiscard(false) },
          {
            label: t('editor.discard'),
            tone: 'danger',
            onPress: () => {
              setConfirmDiscard(false);
              clear();
              router.back();
            },
          },
        ]}
      />

      {cropping && current ? (
        <CropEditor
          page={current}
          onCancel={() => setCropping(false)}
          onDone={(quad) => {
            setCropping(false);
            noteCropCorrected(current);
            void update(index, { quad });
          }}
        />
      ) : null}

      {working ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ backgroundColor: colors.mediaOverlay, borderRadius: radius.md, padding: spacing.md }}>
            <TLoading inverse />
          </View>
        </View>
      ) : null}

      {saving ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
          <View style={{ width: '100%', maxWidth: 320, backgroundColor: colors.bgContainer, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md }}>
            <TText variant="title" align="center">
              {saving.stage === 'ocr' ? t('ocr.running') : t('editor.saving')}
            </TText>
            <TProgress value={progressValue} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cropHint: { position: 'absolute', left: 0, right: 0, top: 12, alignItems: 'center' },
  pageBadge: { position: 'absolute', bottom: 12, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4 },
});
