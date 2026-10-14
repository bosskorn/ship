import React, { useCallback, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconName, TActionSheet, TButton, TDialog, TIcon, TIconButton, TNavigationBar, TProgress, TScreen, TText, useTheme, useToast,
} from '@/design-system';
import type { DraftPage } from '@/core/document-engine/model';
import { duplicateAt, insertAt, MAX_DOCUMENT_PAGES, movePage, PageItem, removeAt, roomFor } from '@/core/document-engine/pages/pageOps';
import { DocumentPageService, PageLimitError } from '@/core/document-engine/services/DocumentPageService';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { isDiskFull } from '@/core/document-engine/storage/diskSpace';
import { useSettings } from '@/core/config/settingsStore';
import { useDocuments } from '@/features/documents/documentsStore';
import { nextScanTitle } from '@/features/scanner/fileName';
import { CropEditor } from '@/features/editor/CropEditor';
import { PageGrid, PageThumb } from './PageGrid';
import { DocumentPickSheet } from './DocumentPickSheet';
import { usePageWorkspace } from './pageWorkspace';

type AddSource = 'camera' | 'photos' | 'document' | 'pdf';

/**
 * Page Manager: one screen for every page tool. Reorder (long press + drag, or move buttons),
 * rotate, duplicate, crop, delete, add pages from the camera, photos, another document or a
 * PDF file, preview, then save — into the document (Manage pages) or as a new document
 * (Images → PDF, Merge), leaving the sources untouched.
 */
export function PageManagerScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { colors, spacing } = useTheme();
  const { purpose, documentId, docType, items, dirty, setItems, clear } = usePageWorkspace();
  const documents = useDocuments((s) => s.documents);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickDoc, setPickDoc] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [cropping, setCropping] = useState<PageItem | null>(null);

  const leave = useCallback(() => {
    clear();
    router.back();
  }, [clear]);
  const back = useCallback(() => {
    if (busy) return true;
    if (dirty) setConfirmLeave(true);
    else leave();
    return true;
  }, [busy, dirty, leave]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', back);
      return () => sub.remove();
    }, [back]),
  );

  const selectedIdx = items.map((it, i) => (selected.has(it.key) ? i : -1)).filter((i) => i >= 0);
  const one = selectedIdx.length === 1 ? selectedIdx[0] : null;
  const titleKey = purpose === 'images' ? 'pages.title_images' : purpose === 'merge' ? 'pages.title_merge' : 'pages.title_document';
  const sourceTitle = (it: PageItem) => (purpose === 'merge' && it.sourceDocumentId ? documents.find((d) => d.id === it.sourceDocumentId)?.title : undefined);

  const update = (next: PageItem[]) => setItems(next);
  const append = (more: PageItem[]) => {
    const room = roomFor(items.length);
    if (more.length > room) toast(t('pages.limit', { count: MAX_DOCUMENT_PAGES }), 'info');
    if (room > 0) update(insertAt(items, items.length, more.slice(0, room)));
  };

  const run = async (label: string, work: (progress: (p: number) => void) => Promise<void>) => {
    setBusy({ label, progress: 0 });
    try {
      await work((progress) => setBusy({ label, progress }));
    } catch (e) {
      toast(e instanceof PageLimitError ? t('pages.limit', { count: e.limit }) : isDiskFull(e) ? t('errors.disk_full') : t('pages.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const add = async (source: AddSource) => {
    setAdding(false);
    if (roomFor(items.length) <= 0) return toast(t('pages.limit', { count: MAX_DOCUMENT_PAGES }), 'info');
    if (source === 'document') return setPickDoc(true);
    if (source === 'pdf') {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const uri = res.assets[0].uri;
      return run(t('pages.loading'), async (p) => {
        try {
          append(await DocumentPageService.fromPdfFile(uri, (d, n) => p(d / n)));
        } catch {
          toast(t('pages.pdf_failed'), 'error');
        }
      });
    }
    const asScan = purpose === 'document';
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (res.canceled || !res.assets[0]) return;
      const uri = res.assets[0].uri;
      return run(t('pages.loading'), async () => {
        append([asScan ? await DocumentPageService.fromCapture(uri, docType) : (await DocumentPageService.fromImages([uri]))[0]]);
      });
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: roomFor(items.length), quality: 1 });
    if (res.canceled || !res.assets.length) return;
    const uris = res.assets.map((a) => a.uri);
    return run(t('pages.loading'), async (p) => {
      if (!asScan) return append(await DocumentPageService.fromImages(uris, (d, n) => p(d / n)));
      const out: PageItem[] = [];
      for (let i = 0; i < uris.length; i++) {
        out.push(await DocumentPageService.fromCapture(uris[i], docType));
        p((i + 1) / uris.length);
      }
      append(out);
    });
  };

  const rotate = (delta: 90 | -90) => update(items.map((it) => (selected.has(it.key) ? DocumentPageService.rotate(it, delta) : it)));
  const duplicate = () => {
    if (roomFor(items.length) < selectedIdx.length) return toast(t('pages.limit', { count: MAX_DOCUMENT_PAGES }), 'info');
    let next = items;
    for (const i of [...selectedIdx].reverse()) next = duplicateAt(next, i, (it) => DocumentPageService.copy(it));
    update(next);
  };
  const remove = () => {
    if (selectedIdx.length >= items.length) return toast(t('pages.need_one'), 'info');
    update(removeAt(items, selectedIdx));
    setSelected(new Set());
  };
  const shift = (delta: -1 | 1) => {
    if (one === null) return;
    update(movePage(items, one, one + delta));
  };

  const save = () =>
    run(t('pages.working'), async (p) => {
      const quality = useSettings.getState().scanner.quality;
      const onStage = (_s: unknown, progress: number) => p(progress);
      if (purpose === 'document' && documentId) {
        const doc = await documentRepository.get(documentId);
        if (!doc) throw new Error('missing');
        await DocumentPageService.saveInto(doc, items, { quality, onStage });
        await useDocuments.getState().refresh();
        toast(t('pages.saved'), 'success');
        leave();
        return;
      }
      const title = await nextScanTitle(useSettings.getState().fileNamePrefix, (b) => documentRepository.titlesLike(b));
      const doc = await DocumentPageService.saveAsNew(items, { title, docType, quality, onStage });
      await useDocuments.getState().refresh();
      toast(t('pages.created'), 'success');
      clear();
      router.replace({ pathname: '/document/[id]', params: { id: doc.id } });
    });

  const tool = (key: string, icon: IconName, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      key={key}
      testID={`pm-${key}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', gap: 2, minWidth: 56, opacity: disabled ? 0.38 : pressed ? 0.6 : 1 })}
    >
      <TIcon name={icon} size="md" color={key === 'delete' ? colors.error : colors.textPrimary} />
      <TText variant="caption" color={key === 'delete' ? 'error' : 'textSecondary'}>
        {label}
      </TText>
    </Pressable>
  );

  const footer =
    selecting && selectedIdx.length ? (
      <View style={[styles.bar, { borderTopColor: colors.divider, backgroundColor: colors.bgContainer }]}>
        {tool('rotate-left', 'rotate', t('pages.rotate_left'), () => rotate(-90))}
        {tool('rotate-right', 'rotate', t('pages.rotate_right'), () => rotate(90))}
        {tool('duplicate', 'duplicate', t('pages.duplicate'), duplicate)}
        {tool('crop', 'crop', t('pages.crop'), () => one !== null && setCropping(items[one]), one === null)}
        {tool('earlier', 'back', t('pages.move_earlier'), () => shift(-1), one === null || one === 0)}
        {tool('later', 'chevronRight', t('pages.move_later'), () => shift(1), one === null || one === items.length - 1)}
        {tool('delete', 'delete', t('pages.delete'), remove)}
      </View>
    ) : (
      <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.bgContainer }}>
        <TButton testID="pm-add" label={t('pages.add')} icon="plus" variant="outline" onPress={() => setAdding(true)} style={{ flex: 1 }} />
        <TButton
          testID="pm-save"
          label={purpose === 'merge' ? t('pages.merge') : purpose === 'images' ? t('pages.create_pdf') : t('pages.save')}
          disabled={!items.length || (purpose === 'document' && !dirty)}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    );

  return (
    <TScreen
      surface="container"
      header={
        <TNavigationBar
          title={t(titleKey)}
          onBack={back}
          right={
            <TButton
              testID="pm-select"
              label={selecting ? t('pages.done') : t('pages.select')}
              variant="text"
              size="small"
              onPress={() => {
                setSelecting(!selecting);
                setSelected(new Set());
              }}
            />
          }
        />
      }
      footer={footer}
    >
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 }}>
          <TText testID="pm-count" variant="title">
            {selecting && selectedIdx.length ? t('pages.selected', { count: selectedIdx.length }) : t('pages.count', { count: items.length })}
          </TText>
          <TText variant="bodySmall" color="textSecondary">
            {selecting ? t('pages.hint_select') : t('pages.hint')}
            {purpose !== 'document' ? ` · ${t('pages.originals_kept')}` : ''}
          </TText>
        </View>
        <PageGrid
          items={items}
          selected={selecting ? selected : undefined}
          onDragChange={setDragging}
          onMove={(from, to) => update(movePage(items, from, to))}
          badge={sourceTitle}
          onPress={(it, i) => {
            if (!selecting) return setPreview(i);
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(it.key)) next.delete(it.key);
              else next.add(it.key);
              return next;
            });
          }}
        />
      </ScrollView>

      <TActionSheet
        visible={adding}
        title={t('pages.add')}
        cancelLabel={t('common.cancel')}
        onClose={() => setAdding(false)}
        onSelect={(k) => void add(k as AddSource)}
        items={[
          { key: 'camera', label: t('pages.add_camera'), icon: 'camera' },
          { key: 'photos', label: t('pages.add_photos'), icon: 'importPhoto' },
          { key: 'document', label: t('pages.add_document'), icon: 'documents' },
          { key: 'pdf', label: t('pages.add_pdf'), icon: 'importPdf' },
        ]}
      />
      <DocumentPickSheet
        visible={pickDoc}
        exclude={purpose === 'document' ? (documentId ?? undefined) : undefined}
        onClose={() => setPickDoc(false)}
        onPick={(doc) => {
          setPickDoc(false);
          void run(t('pages.loading'), async () => append(await DocumentPageService.fromDocument(doc)));
        }}
      />
      <PagePreview items={items} index={preview} onIndex={setPreview} />
      {cropping ? (
        <Modal visible animationType="slide" onRequestClose={() => setCropping(null)} statusBarTranslucent>
          <CropEditor
            page={cropping.page as DraftPage}
            onCancel={() => setCropping(null)}
            onDone={(quad) => {
              const target = cropping;
              setCropping(null);
              void run(t('pages.loading'), async () => {
                const done = await DocumentPageService.crop(target, quad);
                update(usePageWorkspace.getState().items.map((it) => (it.key === target.key ? done : it)));
              });
            }}
          />
        </Modal>
      ) : null}
      <TDialog
        visible={confirmLeave}
        title={t('pages.discard_title')}
        content={t('pages.discard_body')}
        onRequestClose={() => setConfirmLeave(false)}
        actions={[
          { label: t('pages.keep'), onPress: () => setConfirmLeave(false) },
          {
            label: t('pages.discard'),
            tone: 'danger',
            onPress: () => {
              setConfirmLeave(false);
              leave();
            },
          },
        ]}
      />
      {busy ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
          <View testID="pm-busy" style={{ width: '100%', backgroundColor: colors.bgContainer, borderRadius: 16, padding: spacing.lg, gap: spacing.sm }}>
            <TText variant="title" align="center">
              {busy.label}
            </TText>
            <TProgress value={busy.progress} />
          </View>
        </View>
      ) : null}
    </TScreen>
  );
}

/** Full-screen page preview with previous / next. */
function PagePreview({ items, index, onIndex }: { items: PageItem[]; index: number | null; onIndex: (i: number | null) => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (index === null || !items[index]) return null;
  const w = width - spacing.lg * 2;
  const h = Math.min(height - insets.top - insets.bottom - 160, w * 1.414);
  return (
    <Modal visible animationType="fade" onRequestClose={() => onIndex(null)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.mediaBg, paddingTop: insets.top, paddingBottom: insets.bottom, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs, height: 56 }}>
          <TIconButton icon="close" color={colors.mediaText} accessibilityLabel={t('common.close')} onPress={() => onIndex(null)} />
          <TText variant="title" style={{ color: colors.mediaText }}>
            {t('pages.position', { n: index + 1, total: items.length })}
          </TText>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PageThumb item={items[index]} width={w} height={h} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xl, paddingVertical: spacing.md }}>
          <TIconButton icon="back" color={colors.mediaText} disabled={index === 0} accessibilityLabel={t('pages.move_earlier')} onPress={() => onIndex(index - 1)} />
          <TIconButton icon="chevronRight" color={colors.mediaText} disabled={index === items.length - 1} accessibilityLabel={t('pages.move_later')} onPress={() => onIndex(index + 1)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', minHeight: 64, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth },
});
