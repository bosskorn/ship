import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TChip, TChipRow, TInput, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import { DocumentPageService } from '@/core/document-engine/services/DocumentPageService';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useSettings } from '@/core/config/settingsStore';
import { useDocuments } from '@/features/documents/documentsStore';
import { uniqueTitle } from '@/features/scanner/fileName';
import { PageGrid } from './PageGrid';
import { SourcePicker } from './SourcePicker';
import { pickPdf, usePageSource } from './usePageSource';
import { useLongTask } from './useLongTask';
import { planSplit, SplitMode } from './splitPlan';

/**
 * Split / extract (on device): every page, selected pages, or page ranges, each output a new
 * document built from the source's pages. The source document is never changed.
 */
export function SplitScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { spacing, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { source, loading, error, fromDocument, fromFile } = usePageSource(id);
  const [mode, setMode] = useState<SplitMode>('ranges');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ranges, setRanges] = useState('');
  const task = useLongTask();

  const items = source?.items ?? [];
  const selected = items.map((it, i) => (picked.has(it.key) ? i : -1)).filter((i) => i >= 0);
  const plan = source ? planSplit(mode, { title: source.title, pageCount: items.length, selected, ranges }) : null;
  const parts = plan && 'parts' in plan ? plan.parts : [];
  const planError = plan && 'error' in plan && !(plan.error === 'empty' && !ranges.trim()) ? plan.error : null;

  const run = () =>
    task.run(t('pages.working'), t('split.failed'), async ({ signal, progress, onStage }) => {
      if (!source || !parts.length) return;
      // Titles first (never overwrite: _2, _3… on collision), then all parts or none.
      const titled = [];
      const taken: string[] = [];
      for (const p of parts) {
        const title = uniqueTitle(p.title, [...(await documentRepository.titlesLike(p.title).catch(() => [])), ...taken]);
        taken.push(title);
        titled.push({ title, items: p.pages.map((i) => DocumentPageService.copy(items[i])) });
      }
      const many = titled.length > 1;
      await DocumentPageService.saveParts(titled, {
        docType: source.document?.docType ?? 'document',
        quality: useSettings.getState().scanner.quality,
        signal,
        onPart: many ? (d, n) => progress(d, n, 'documents') : undefined,
        onStage: many ? undefined : onStage,
      });
      await useDocuments.getState().refresh();
      toast(t('split.done', { count: titled.length }), 'success');
      router.back();
    });

  const openFile = async () => {
    const file = await pickPdf();
    if (file) await task.run(t('pages.loading'), t('pages.pdf_failed'), ({ signal, progress }) => fromFile(file, { signal, onProgress: progress }));
  };

  const hint = mode === 'all' ? t('split.all_hint') : mode === 'select' ? t('split.select_hint') : t('split.ranges_hint');
  const tooShort = source && items.length < 2 && mode !== 'select';

  return (
    <TScreen
      surface="container"
      header={<TNavigationBar title={t('split.title')} onBack={() => router.back()} />}
      footer={
        source ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
            <TText testID="split-result" variant="body" color={planError ? 'error' : 'textSecondary'} style={{ flex: 1 }}>
              {planError ? (planError === 'select_some' ? t('split.select_some') : t(`split.err_${planError}`)) : tooShort ? t('split.need_two_pages') : parts.length ? t('split.result', { count: parts.length }) : ''}
            </TText>
            <TButton
              testID="split-run"
              label={mode === 'select' ? t('split.run_extract') : t('split.run_split')}
              disabled={!parts.length || !!tooShort || task.busy}
              onPress={() => void run()}
            />
          </View>
        ) : undefined
      }
    >
      {!source ? (
        <SourcePicker hint={t('split.title')} loading={loading} error={error} onDocument={fromDocument} onFile={() => void openFile()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 2 }}>
            <TText variant="title" numberOfLines={1}>
              {source.title}
            </TText>
            <TText variant="bodySmall" color="textSecondary">
              {t('pages.count', { count: items.length })} · {t('pages.originals_kept')}
            </TText>
          </View>
          <TChipRow>
            <TChip testID="split-ranges" label={t('split.mode_ranges')} selected={mode === 'ranges'} onPress={() => setMode('ranges')} />
            <TChip testID="split-select" label={t('split.mode_select')} selected={mode === 'select'} onPress={() => setMode('select')} />
            <TChip testID="split-all" label={t('split.mode_all')} selected={mode === 'all'} onPress={() => setMode('all')} />
          </TChipRow>
          <TText variant="bodySmall" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
            {hint}
          </TText>
          {mode === 'ranges' ? (
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              <TInput testID="split-input" label={t('split.ranges_label')} value={ranges} onChangeText={setRanges} placeholder="1-3, 7-10" keyboardType="numbers-and-punctuation" autoCorrect={false} />
            </View>
          ) : null}
          {parts.length && mode !== 'select' ? (
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 2 }}>
              {parts.slice(0, 6).map((p) => (
                <TText key={p.title} variant="bodySmall" numberOfLines={1}>
                  • {p.title} ({t('pages.count', { count: p.pages.length })})
                </TText>
              ))}
              {parts.length > 6 ? <TText variant="bodySmall" color="textSecondary">…</TText> : null}
            </View>
          ) : null}
          <PageGrid
            items={items}
            selected={mode === 'select' ? picked : new Set(parts.flatMap((p) => p.pages).map((i) => items[i]?.key).filter(Boolean) as string[])}
            onPress={(it) => {
              if (mode !== 'select') return;
              setPicked((s) => {
                const next = new Set(s);
                if (next.has(it.key)) next.delete(it.key);
                else next.add(it.key);
                return next;
              });
            }}
          />
        </ScrollView>
      )}
      {task.element}
    </TScreen>
  );
}
