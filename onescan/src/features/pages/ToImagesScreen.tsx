import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TChip, TChipRow, TInput, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import { ImageExportService, ImageFormat } from '@/core/document-engine/services/ImageExportService';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';
import { parseRanges, pagesInRanges } from '@/core/document-engine/pages/pageOps';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useSettings } from '@/core/config/settingsStore';
import { useDocuments } from '@/features/documents/documentsStore';
import { nextScanTitle } from '@/features/scanner/fileName';
import { PageGrid } from './PageGrid';
import { SourcePicker } from './SourcePicker';
import { pickPdf, usePageSource } from './usePageSource';
import { useLongTask } from './useLongTask';

type PickMode = 'all' | 'select' | 'ranges';

/**
 * PDF → images (on device): all pages, tapped pages or a page range, as JPG or PNG; then save
 * them to a folder the user picks, share one, or turn them into a new OneScan document. The
 * source is never changed, and nothing is written to shared storage without the user's pick.
 * (JPG is the page master itself, so there is no quality setting to offer; PNG is lossless.)
 */
export function ToImagesScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { spacing, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { source, loading, error, fromDocument, fromFile } = usePageSource(id);
  const task = useLongTask();
  const [format, setFormat] = useState<ImageFormat>('jpg');
  const [mode, setMode] = useState<PickMode>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ranges, setRanges] = useState('');

  const items = source?.items ?? [];
  const parsed = mode === 'ranges' ? parseRanges(ranges, items.length) : null;
  const rangeError = parsed && 'error' in parsed && !(parsed.error === 'empty' && !ranges.trim()) ? parsed.error : null;
  const indexes =
    mode === 'all'
      ? items.map((_, i) => i)
      : mode === 'select'
        ? items.map((it, i) => (picked.has(it.key) ? i : -1)).filter((i) => i >= 0)
        : parsed && 'ranges' in parsed
          ? pagesInRanges(parsed.ranges)
          : [];
  const chosen = indexes.map((i) => ({ it: items[i], i }));
  const selectedKeys = new Set(chosen.map(({ it }) => it.key));

  const exportChosen = (signal: { cancelled: boolean }, progress: (d: number, n: number, unit: 'images') => void) =>
    ImageExportService.exportPages(
      chosen.map(({ i }) => ({ uri: source!.masters[i], pageNumber: i + 1 })),
      { title: source!.title, pageCount: items.length, format, signal, onProgress: (d, n) => progress(d, n, 'images') },
    );

  const save = async () => {
    let exported: Awaited<ReturnType<typeof exportChosen>> | null = null;
    const ok = await task.run(t('to_images.working'), t('to_images.failed'), async ({ signal, progress }) => {
      exported = await exportChosen(signal, progress);
    });
    if (!ok || !exported) return;
    // The folder picker opens after the progress panel closes.
    const n = await ImageExportService.saveToDevice(exported).catch(() => {
      toast(t('to_images.failed'), 'error');
      return null;
    });
    if (n !== null) toast(t('to_images.saved', { count: n }), 'success');
  };
  const share = async () => {
    if (chosen.length !== 1) return void toast(t('to_images.share_one_only'), 'info');
    let exported: Awaited<ReturnType<typeof exportChosen>> | null = null;
    const ok = await task.run(t('to_images.working'), t('to_images.failed'), async ({ signal, progress }) => {
      exported = await exportChosen(signal, progress);
    });
    if (ok && exported) await ImageExportService.shareOne(exported).catch(() => toast(t('errors.share_unavailable'), 'error'));
  };
  const importBack = () =>
    task.run(t('pages.working'), t('pages.create_failed'), async ({ signal, onStage }) => {
      const title = await nextScanTitle(useSettings.getState().fileNamePrefix, (b) => documentRepository.titlesLike(b));
      const doc = await DocumentPageService.saveAsNew(
        chosen.map(({ it }) => DocumentPageService.copy(it)),
        { title, docType: 'document', quality: useSettings.getState().scanner.quality, onStage, signal },
      );
      await useDocuments.getState().refresh();
      router.replace({ pathname: '/document/[id]', params: { id: doc.id } });
    });

  const openFile = async () => {
    const file = await pickPdf();
    if (file) await task.run(t('pages.loading'), t('pages.pdf_failed'), ({ signal, progress }) => fromFile(file, { signal, onProgress: progress }));
  };

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  const none = !chosen.length || task.busy;

  return (
    <TScreen
      surface="container"
      header={<TNavigationBar title={t('to_images.title')} onBack={() => router.back()} />}
      footer={
        source ? (
          <View style={{ gap: spacing.xs, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TButton
                testID="img-share"
                label={t('to_images.share')}
                icon="share"
                variant="outline"
                disabled={chosen.length !== 1 || task.busy}
                onPress={() => void share()}
                style={{ flex: 1 }}
              />
              <TButton testID="img-save" label={t('to_images.save')} icon="download" disabled={none} onPress={() => void save()} style={{ flex: 1 }} />
            </View>
            {chosen.length > 1 ? (
              <TText variant="caption" color="textSecondary" align="center">
                {t('to_images.share_one_only')}
              </TText>
            ) : null}
            <TButton testID="img-import" label={t('to_images.import')} variant="text" disabled={none} onPress={() => void importBack()} />
          </View>
        ) : undefined
      }
    >
      {!source ? (
        <SourcePicker hint={t('to_images.title')} loading={loading} error={error} onDocument={fromDocument} onFile={() => void openFile()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 2 }}>
            <TText variant="title" numberOfLines={1}>
              {source.title}
            </TText>
            <TText testID="img-count" variant="bodySmall" color={rangeError ? 'error' : 'textSecondary'}>
              {rangeError
                ? t(`split.err_${rangeError}`)
                : chosen.length === items.length
                  ? t('to_images.pages_all')
                  : t('to_images.pages_selected', { count: chosen.length })}
            </TText>
          </View>
          <TChipRow>
            <TChip testID="fmt-jpg" label={t('to_images.jpg')} selected={format === 'jpg'} onPress={() => setFormat('jpg')} />
            <TChip testID="fmt-png" label={t('to_images.png')} selected={format === 'png'} onPress={() => setFormat('png')} />
          </TChipRow>
          <TChipRow>
            <TChip testID="mode-all" label={t('to_images.mode_all')} selected={mode === 'all'} onPress={() => setMode('all')} />
            <TChip testID="mode-select" label={t('to_images.mode_select')} selected={mode === 'select'} onPress={() => setMode('select')} />
            <TChip testID="mode-ranges" label={t('to_images.mode_ranges')} selected={mode === 'ranges'} onPress={() => setMode('ranges')} />
          </TChipRow>
          {mode === 'ranges' ? (
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              <TInput testID="img-ranges" label={t('to_images.mode_ranges')} value={ranges} onChangeText={setRanges} placeholder={t('to_images.ranges_hint')} keyboardType="numbers-and-punctuation" autoCorrect={false} />
            </View>
          ) : mode === 'select' ? (
            <TText variant="bodySmall" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
              {t('pages.hint_select')}
            </TText>
          ) : null}
          <PageGrid items={items} selected={selectedKeys} onPress={(it) => mode === 'select' && toggle(it.key)} />
        </ScrollView>
      )}
      {task.element}
    </TScreen>
  );
}
