import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCell, TCellGroup, TEmpty, TNavigationBar, TProgress, TScreen, TTag, TText, useTheme, useToast } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { RedactionEngine, PiiType } from '@/core/document-engine/redaction/RedactionEngine';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { useFeature } from '@/core/config/remoteConfig';
import { useDocuments } from '@/features/documents/documentsStore';
import { track } from '@/services/analytics/analytics';

/** On-device PII summary (spec §17) and redacted copy (spec §18). Counts only — values are never logged. */
export function SensitiveDataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const redactionEnabled = useFeature('redaction') && DocumentEngine.capture.hasNativeVision();
  const [text, setText] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (id) documentRepository.ocrText(id).then(setText).catch(() => setText(''));
  }, [id]);

  const summary = useMemo(() => (text ? RedactionEngine.summarize(RedactionEngine.detect(text)) : {}), [text]);
  const entries = Object.entries(summary) as [PiiType, number][];
  const total = entries.reduce((n, [, c]) => n + c, 0);

  useEffect(() => {
    if (text !== null) track('sensitive_detected', { count: total });
  }, [text, total]);

  const mask = async () => {
    if (!id) return;
    const doc = await documentRepository.get(id);
    if (!doc) return;
    setProgress(0);
    try {
      const copy = await DocumentEngine.createRedactedCopy(doc, t('documents.redacted_name', { name: doc.title }), (stage, p) =>
        setProgress(stage === 'pages' ? p * 0.8 : 0.9),
      );
      track('redaction_applied', { count: total });
      await useDocuments.getState().refresh();
      toast(t('redaction.created'), 'success');
      router.replace({ pathname: '/document/[id]', params: { id: copy.id } });
    } catch {
      toast(t('errors.generic'), 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <TScreen
      scroll
      header={<TNavigationBar title={t('sensitive.review')} onBack={() => router.back()} />}
      footer={
        progress !== null ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
            <View style={{ width: '100%', maxWidth: 320, backgroundColor: colors.bgContainer, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md }}>
              <TText variant="title" align="center">
                {t('redaction.title')}
              </TText>
              <TProgress value={progress} />
            </View>
          </View>
        ) : null
      }
    >
      {text === null ? null : total === 0 ? (
        <TEmpty icon="shield" title={t('sensitive.none')} description={DocumentEngine.ocr.isAvailable() ? undefined : t('ocr.engine_unavailable')} />
      ) : (
        <>
          <View style={{ padding: spacing.md, gap: spacing.xs }}>
            <TText variant="titleLarge">{t('sensitive.title')}</TText>
            <TTag theme="warning" icon="shield" label={t('sensitive.found', { count: total })} />
          </View>
          <TCellGroup>
            {entries.map(([type, count]) => (
              <TCell key={type} title={t(`sensitive.${type}`)} note={String(count)} />
            ))}
          </TCellGroup>
          <View style={{ padding: spacing.md, gap: spacing.xs }}>
            {redactionEnabled ? (
              <>
                <TButton testID="mask-sensitive" label={t('sensitive.mask')} icon="redact" block onPress={mask} disabled={progress !== null} />
                <TText variant="bodySmall" color="textPlaceholder" align="center">
                  {t('redaction.note')}
                </TText>
              </>
            ) : null}
          </View>
        </>
      )}
    </TScreen>
  );
}
