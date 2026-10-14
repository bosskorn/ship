import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TButton, TDialog, TProgress, TText, useTheme, useToast } from '@/design-system';
import type { SaveStage, StageCallback } from '@/core/document-engine/DocumentEngine';
import { CancelSignal, OperationCancelled } from '@/core/document-engine/cancel';
import { PageLimitError } from '@/core/document-engine/pages/pageOps';
import { isDiskFull } from '@/core/document-engine/storage/diskSpace';

export interface TaskContext {
  signal: CancelSignal;
  /** Real counts: "x / n" pages (default), documents or images. */
  progress: (done: number, total: number, unit?: Unit) => void;
  /** For engine saves: stage name plus page counts when the stage has them. */
  onStage: StageCallback;
}

type Unit = 'pages' | 'documents' | 'images';

interface Busy {
  label: string;
  unit: Unit;
  stage: SaveStage | null;
  done: number;
  total: number;
  fraction: number;
}

/**
 * One way for every page tool to run a long operation: a progress panel with real page counts
 * and Cancel (stops between pages; the engine removes what it wrote), plain-language errors
 * with "Try again", and nothing technical shown. `failText` names what failed.
 */
export function useLongTask() {
  const { t } = useTranslation();
  const toast = useToast();
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState<Busy | null>(null);
  const [failed, setFailed] = useState<{ text: string; retry: () => void } | null>(null);
  const signal = useRef<{ cancelled: boolean }>({ cancelled: false });

  const run = async (label: string, failText: string, work: (ctx: TaskContext) => Promise<void>): Promise<boolean> => {
    const sig = { cancelled: false };
    signal.current = sig;
    setBusy({ label, unit: 'pages', stage: null, done: 0, total: 0, fraction: 0 });
    const ctx: TaskContext = {
      signal: sig,
      progress: (done, total, unit = 'pages') => setBusy((b) => (b ? { ...b, unit, stage: null, done, total, fraction: total ? done / total : 0 } : b)),
      onStage: (stage, fraction, done, total) => setBusy((b) => (b ? { ...b, stage, fraction, done: done ?? 0, total: total ?? 0 } : b)),
    };
    try {
      await work(ctx);
      return true;
    } catch (e) {
      if (e instanceof OperationCancelled) toast(t('pages.cancelled'), 'info');
      else if (e instanceof PageLimitError) toast(t('pages.limit', { count: e.limit }), 'info');
      else if (isDiskFull(e)) toast(t('errors.disk_full'), 'error');
      else setFailed({ text: failText, retry: () => void run(label, failText, work) });
      return false;
    } finally {
      if (signal.current === sig) setBusy(null);
    }
  };

  const stageText = (b: Busy) => {
    if (b.stage === 'pdf') return t('pages.stage_pdf');
    if (b.stage === 'index') return t('pages.stage_index');
    if (!b.total) return '';
    if (b.stage === 'ocr') return t('pages.stage_ocr', { done: b.done, total: b.total });
    if (b.stage === null && b.unit === 'documents') return t('pages.stage_documents', { done: b.done, total: b.total });
    if (b.stage === null && b.unit === 'images') return t('pages.stage_images', { done: b.done, total: b.total });
    return t('pages.stage_pages', { done: b.done, total: b.total });
  };

  const element = (
    <>
      {busy ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
          <View
            testID="task-busy"
            accessibilityLiveRegion="polite"
            style={{ width: '100%', backgroundColor: colors.bgContainer, borderRadius: 16, padding: spacing.lg, gap: spacing.sm }}
          >
            <TText variant="title" align="center">
              {busy.label}
            </TText>
            <TText testID="task-count" variant="body" color="textSecondary" align="center">
              {stageText(busy)}
            </TText>
            <TProgress value={busy.fraction} />
            <TButton
              testID="task-cancel"
              label={t('common.cancel')}
              variant="text"
              onPress={() => {
                signal.current.cancelled = true;
                setBusy((b) => (b ? { ...b, label: t('pages.cancelling') } : b));
              }}
            />
          </View>
        </View>
      ) : null}
      <TDialog
        visible={!!failed}
        title={failed?.text ?? ''}
        content={t('pages.failed_body')}
        onRequestClose={() => setFailed(null)}
        actions={[
          { label: t('common.close'), onPress: () => setFailed(null) },
          {
            label: t('pages.try_again'),
            tone: 'primary',
            onPress: () => {
              const retry = failed?.retry;
              setFailed(null);
              retry?.();
            },
          },
        ]}
      />
    </>
  );

  return { run, busy: busy !== null, element };
}
