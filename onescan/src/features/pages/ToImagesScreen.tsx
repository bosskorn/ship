import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TChip, TChipRow, TNavigationBar, TProgress, TScreen, TText, useTheme, useToast } from '@/design-system';
import { ImageExportService, ImageFormat } from '@/core/document-engine/services/ImageExportService';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useSettings } from '@/core/config/settingsStore';
import { isDiskFull } from '@/core/document-engine/storage/diskSpace';
import { useDocuments } from '@/features/documents/documentsStore';
import { nextScanTitle } from '@/features/scanner/fileName';
import { PageGrid } from './PageGrid';
import { SourcePicker } from './SourcePicker';
import { usePageSource } from './usePageSource';

/**
 * PDF → images (on device): choose the pages and JPG/PNG, then save them to a folder on the
 * device, share one, or turn them into a new OneScan document. The source is never changed.
 */
export function ToImagesScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { spacing, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { source, loading, error, fromDocument, fromFile } = usePageSource(id);
  const [format, setFormat] = useState<ImageFormat>('jpg');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const items = source?.items ?? [];
  // Nothing picked yet = every page.
  const selected = picked ?? new Set(items.map((i) => i.key));
  const chosen = items.map((it, i) => ({ it, i })).filter(({ it }) => selected.has(it.key));
  const allPages = chosen.length === items.length;

  const exportChosen = () =>
    ImageExportService.exportPages(
      chosen.map(({ i }) => ({ uri: source!.masters[i], pageNumber: i + 1 })),
      { title: source!.title, pageCount: items.length, format, onProgress: (d, n) => setBusy(d / n) },
    );

  const guard = async (work: () => Promise<void>) => {
    setBusy(0);
    try {
      await work();
    } catch (e) {
      toast(isDiskFull(e) ? t('errors.disk_full') : t('pages.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    guard(async () => {
      const exported = await exportChosen();
      setBusy(null);
      const n = await ImageExportService.saveToDevice(exported);
      if (n !== null) toast(t('to_images.saved', { count: n }), 'success');
    });
  const share = () =>
    guard(async () => {
      if (chosen.length !== 1) return void toast(t('to_images.share_one_only'), 'info');
      await ImageExportService.shareOne(await exportChosen());
    });
  const importBack = () =>
    guard(async () => {
      const title = await nextScanTitle(useSettings.getState().fileNamePrefix, (b) => documentRepository.titlesLike(b));
      const doc = await DocumentPageService.saveAsNew(
        chosen.map(({ it }) => DocumentPageService.copy(it)),
        { title, docType: 'document', quality: useSettings.getState().scanner.quality, onStage: (_s, p) => setBusy(p) },
      );
      await useDocuments.getState().refresh();
      router.replace({ pathname: '/document/[id]', params: { id: doc.id } });
    });

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

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
                disabled={chosen.length !== 1 || busy !== null}
                onPress={() => void share()}
                style={{ flex: 1 }}
              />
              <TButton testID="img-save" label={t('to_images.save')} icon="download" disabled={!chosen.length || busy !== null} onPress={() => void save()} style={{ flex: 1 }} />
            </View>
            {chosen.length > 1 ? (
              <TText variant="caption" color="textSecondary" align="center">
                {t('to_images.share_one_only')}
              </TText>
            ) : null}
            <TButton testID="img-import" label={t('to_images.import')} variant="text" disabled={!chosen.length || busy !== null} onPress={() => void importBack()} />
          </View>
        ) : undefined
      }
    >
      {!source ? (
        <SourcePicker hint={t('to_images.title')} loading={loading} error={error} onDocument={fromDocument} onFile={() => void fromFile()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 2 }}>
            <TText variant="title" numberOfLines={1}>
              {source.title}
            </TText>
            <TText testID="img-count" variant="bodySmall" color="textSecondary">
              {allPages ? t('to_images.pages_all') : t('to_images.pages_selected', { count: chosen.length })} · {t('pages.hint_select')}
            </TText>
          </View>
          <TChipRow>
            <TChip testID="fmt-jpg" label={t('to_images.jpg')} selected={format === 'jpg'} onPress={() => setFormat('jpg')} />
            <TChip testID="fmt-png" label={t('to_images.png')} selected={format === 'png'} onPress={() => setFormat('png')} />
            <TChip testID="pick-all" label={t('to_images.pages_all')} icon="selectAll" selected={allPages} onPress={() => setPicked(allPages ? new Set() : null)} />
          </TChipRow>
          <PageGrid items={items} selected={selected} onPress={(it) => toggle(it.key)} />
        </ScrollView>
      )}
      {busy !== null ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
          <View style={{ width: '100%', backgroundColor: colors.bgContainer, borderRadius: 16, padding: spacing.lg, gap: spacing.sm }}>
            <TText variant="title" align="center">
              {t('to_images.working')}
            </TText>
            <TProgress value={busy} />
          </View>
        </View>
      ) : null}
    </TScreen>
  );
}
