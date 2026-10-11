import React, { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TButton, TCell, TCellGroup, TEmpty, TNavigationBar, TScreen, TTag, TText, useTheme } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { RedactionEngine, PiiType } from '@/core/document-engine/redaction/RedactionEngine';
import { useFeature } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';

/** On-device PII summary (spec §17). Counts only — values are never logged. */
export function SensitiveDataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const redactionEnabled = useFeature('redaction');
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (id) documentRepository.ocrText(id).then(setText).catch(() => setText(''));
  }, [id]);

  const summary = useMemo(() => (text ? RedactionEngine.summarize(RedactionEngine.detect(text)) : {}), [text]);
  const entries = Object.entries(summary) as [PiiType, number][];
  const total = entries.reduce((n, [, c]) => n + c, 0);

  useEffect(() => {
    if (text !== null) track('sensitive_detected', { count: total });
  }, [text, total]);

  return (
    <TScreen scroll header={<TNavigationBar title={t('sensitive.review')} onBack={() => router.back()} />}>
      {text === null ? null : total === 0 ? (
        <TEmpty icon="shield" title={t('sensitive.none')} />
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
            <TButton label={t('sensitive.mask')} icon="redact" block onPress={() => router.push('/unavailable')} disabled={!redactionEnabled} />
            <TText variant="bodySmall" color="textPlaceholder" align="center">
              {redactionEnabled ? t('redaction.note') : t('common.comingSoon')}
            </TText>
          </View>
        </>
      )}
    </TScreen>
  );
}
