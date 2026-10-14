import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/core/config/settingsStore';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconName, TActionSheet, TButton, TDialog, TIcon, TIconButton, TLoading, TNavigationBar, TProgress, TText, useTheme, useToast,
} from '@/design-system';
import { DocumentEngine, SaveStage } from '@/core/document-engine/DocumentEngine';
import { cssFilterFor, pageFilters } from '@/core/document-engine/image/filters';
import type { DraftPage, PageFilter, Quad, Rotation } from '@/core/document-engine/model';
import { formatDateTimeCompact } from '@/core/i18n/format';
import { useScanSession } from '@/features/scanner/scanSession';
import { noteCropAccepted, noteCropCorrected } from '@/features/scanner/cropStats';
import { isDiskFull, lowDisk, MIN_FREE_BYTES_SAVE } from '@/core/document-engine/storage/diskSpace';
import { useDocuments } from '@/features/documents/documentsStore';
import { CropEditor } from './CropEditor';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { track } from '@/services/analytics/analytics';
import { SecureImage } from '@/features/shared/SecureImage';

type Tool = 'crop' | 'filter' | 'rotate' | 'delete';
/** Review edits (design V2): Crop · Adjust · Rotate · Delete page. "Clean" is the Document filter under Adjust. */
const tools: { key: Tool; icon: IconName; label: 'editor.crop' | 'editor.adjust' | 'editor.rotate' | 'editor.delete_page' }[] = [
  { key: 'crop', icon: 'crop', label: 'editor.crop' },
  { key: 'filter', icon: 'filter', label: 'editor.adjust' },
  { key: 'rotate', icon: 'rotate', label: 'editor.rotate' },
  { key: 'delete', icon: 'delete', label: 'editor.delete_page' },
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

/** Largest size of the page's preview that fits the stage, or null before layout / without dimensions. */
function paperSize(page: DraftPage, maxW: number, maxH: number) {
  if (!page.width || !page.height || maxW <= 0 || maxH <= 0) return null;
  const k = Math.min(maxW / page.width, maxH / page.height);
  return { width: Math.round(page.width * k), height: Math.round(page.height * k) };
}

export function EditorScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width, height: windowHeight } = useWindowDimensions();
  const pager = useRef<FlatList<DraftPage>>(null);
  const { pages, docType, replacePage, removePage, duplicatePage, movePage, setRescan, setFromEditor, clear } = useScanSession();
  const [index, setIndex] = useState(() => Math.max(0, useScanSession.getState().pages.findIndex((p) => p.crop?.decision === 'manual' && p.crop.presence !== 'none')));
  const [tool, setTool] = useState<Tool | null>(null);
  const [editingTools, setEditingTools] = useState(false);
  const [pageMenu, setPageMenu] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState<{ stage: SaveStage; progress: number } | null>(null);
  const [cropping, setCropping] = useState(() => DocumentEngine.capture.hasNativeVision() && useScanSession.getState().pages.some((p) => p.crop?.decision === 'manual' && p.crop.presence !== 'none'));
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const current = pages[Math.min(index, pages.length - 1)];
  const nativeVision = DocumentEngine.capture.hasNativeVision();

  // Auto crop is the default; the crop editor opens by itself only when the crop was not
  // confident enough to apply (it starts from the suggested corners).
  const [firstUnsure] = useState(() => (nativeVision ? pages.findIndex((p) => p.crop?.decision === 'manual' && p.crop.presence !== 'none') : -1));
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
        return setCropping(true);
      case 'delete':
        return deletePage(index);
    }
  };

  const save = async () => {
    if (!pages.length || saving) return;
    if (lowDisk(MIN_FREE_BYTES_SAVE)) {
      toast(t('errors.disk_low'), 'error');
      return;
    }
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
    } catch (e) {
      setSaving(null);
      // The draft stays open, so the user can free space or try again.
      toast(t(isDiskFull(e) ? 'errors.disk_full' : 'errors.save_failed'), 'error');
    }
  };

  const deletePage = (i: number) => {
    removePage(i);
    if (pages.length <= 1) {
      clear();
      router.back();
    } else setIndex(Math.max(0, Math.min(i, pages.length - 2)));
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
        return deletePage(i);
    }
  };

  const progressValue = saving ? { pages: 0.05, pdf: 0.2, ocr: 0.3 + saving.progress * 0.6, index: 0.95 }[saving.stage] : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary, paddingTop: insets.top }}>
      <TNavigationBar
        title={t('editor.title_pages', { n: pages.length })}
        onBack={() => (pages.length ? setConfirmDiscard(true) : router.back())}
        backLabel={t('common.back')}
        right={current ? <TIconButton icon="more" accessibilityLabel={t('common.more')} onPress={() => setPageMenu(index)} /> : null}
      />

      {/* The page, as paper on the stage */}
      <View style={{ flex: 1 }} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        <FlatList
          ref={pager}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p.id}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => {
            const reservedBottom = editingTools ? (tool === 'filter' ? 240 : 160) : (pages.length > 1 ? 140 : 90);
            const fit = paperSize(item, width - 2 * spacing.md, (stage.height || windowHeight - reservedBottom) - 30);
            return (
              <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingBottom: spacing.sm }}>
                {fit ? (
                  <View style={{ width: fit.width, height: fit.height, borderRadius: 4, backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#0F1521', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }}>
                    <SecureImage uri={item.processedUri} resizeMode="contain" style={[{ width: fit.width, height: fit.height, borderRadius: 4 }, previewFilter(item)]} />
                  </View>
                ) : (
                  <SecureImage uri={item.processedUri} resizeMode="contain" style={[{ flex: 1, alignSelf: 'stretch', marginHorizontal: spacing.md }, previewFilter(item)]} />
                )}
              </View>
            );
          }}
        />
        <View style={styles.pageNo} pointerEvents="none">
          <View style={{ backgroundColor: colors.bgContainer, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 3 }}>
            <TText variant="bodySmall" color="textSecondary">
              {current?.processing ? t('scanner.preparing') : t('editor.page_of', { i: Math.min(index, pages.length - 1) + 1, n: pages.length })}
            </TText>
          </View>
        </View>
        {current?.crop && current.crop.decision !== 'auto' && !current.crop.confirmed && nativeVision ? (
          <View style={styles.cropHint} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.mediaOverlay, borderRadius: 999, paddingStart: spacing.sm, paddingEnd: 4, paddingVertical: 4 }}>
              <TText variant="bodySmall" color="mediaText">
                {current.crop.presence === 'none' ? t('editor.no_document') : current.crop.decision === 'review' ? t('editor.check_edges') : t('editor.no_auto_crop')}
              </TText>
              {current.crop.decision === 'review' && current.crop.presence !== 'none' ? (
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
                  {current.crop.presence === 'none' ? t('editor.pick_edges') : t('editor.adjust_edges')}
                </TText>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: colors.bgContainer, paddingBottom: insets.bottom }}>
        {/* Adjust: filter strip (progressive disclosure) */}
        {editingTools && tool === 'filter' && current ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }} contentContainerStyle={{ padding: spacing.sm, gap: spacing.sm }}>
            {pageFilters.map((f) => {
              const active = current.filter === f;
              return (
                <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => update(index, { filter: f })} style={{ alignItems: 'center', gap: 4 }}>
                  <SecureImage
                    uri={current.processedUri}
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

        {/* Editing tools: Crop, Adjust, Rotate, Delete (shown while the Edit toggle is on) */}
        {editingTools ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.xxs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
            {tools.map((tl) => {
              const active = tool === tl.key;
              return (
                <Pressable
                  key={tl.key}
                  testID={`tool-${tl.key}`}
                  accessibilityRole="button"
                  accessibilityState={tl.key === 'filter' ? { expanded: active } : undefined}
                  onPress={() => onTool(tl.key)}
                  style={({ pressed }) => ({ minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.md, backgroundColor: pressed ? colors.bgPressed : 'transparent' })}
                >
                  <TIcon name={tl.icon} size="md" color={active ? colors.brand : colors.textPrimary} />
                  <TText variant="caption" color={active ? 'brand' : 'textSecondary'}>
                    {t(tl.label)}
                  </TText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Pages: 1 2 3 … shown when multi-page */}
        {pages.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: 8, alignItems: 'center' }}>
            {pages.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={t('editor.page_actions', { index: i + 1 })}
                onPress={() => goTo(i)}
                onLongPress={() => setPageMenu(i)}
                style={{ width: 40, height: 52 }}
              >
                <View style={{ flex: 1, borderRadius: 4, borderWidth: i === index ? 2 : 1, borderColor: i === index ? colors.brand : colors.divider, overflow: 'hidden', backgroundColor: colors.bgSecondary }}>
                  <SecureImage uri={p.processedUri} resizeMode="cover" style={{ flex: 1 }} />
                </View>
                <View style={{ position: 'absolute', right: -2, bottom: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' }}>
                  <TText variant="caption" style={{ color: colors.bgContainer, fontSize: 10, lineHeight: 12 }}>
                    {String(i + 1)}
                  </TText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Bottom controls: add page · edit tools · save */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm }}>
          <TButton
            label={t('editor.add_page')}
            icon="plus"
            variant="secondary"
            size="large"
            onPress={() => {
              setFromEditor(true);
              router.push('/scanner');
            }}
            style={{ flex: 1 }}
          />
          <TButton
            testID="editor-edit-tools"
            label={t('editor.edit_tools')}
            icon="crop"
            variant={editingTools ? 'primary' : 'outline'}
            size="large"
            onPress={() => setEditingTools((v) => !v)}
            style={{ flex: 1 }}
          />
          <TButton
            testID="editor-save"
            label={t('common.save')}
            variant="primary"
            size="large"
            onPress={save}
            disabled={!pages.length || !!saving}
            loading={!!saving}
            style={{ flex: 1.2 }}
          />
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
  cropHint: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  pageNo: { position: 'absolute', left: 0, right: 0, top: 10, alignItems: 'center' },
});
