import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TEmpty, TNavigationBar, TScreen, TSearch, TTabs, TText, useTheme, useToast } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { track } from '@/services/analytics/analytics';

type Tab = 'text' | 'layout';

export function OCRResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('text');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!id) return;
    documentRepository.ocrText(id).then(setText).catch(() => setText(''));
    track('ocr_used', { source: 'viewer' });
  }, [id]);

  const hits = useMemo(() => {
    if (!text || !query.trim()) return 0;
    return text.toLowerCase().split(query.trim().toLowerCase()).length - 1;
  }, [text, query]);

  const engineMissing = !DocumentEngine.ocr.isAvailable() && !text;

  return (
    <TScreen
      surface="container"
      header={
        <>
          <TNavigationBar title={t('ocr.title')} onBack={() => router.back()} />
          <TTabs<Tab> value={tab} onChange={setTab} items={[{ key: 'text', label: t('ocr.tab_text') }, { key: 'layout', label: t('ocr.tab_layout') }]} />
        </>
      }
      footer={
        text ? (
          <View style={{ flexDirection: 'row', gap: spacing.xs, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <TButton
              label={t('ocr.copy')}
              icon="copy"
              variant="secondary"
              size="medium"
              style={{ flex: 1 }}
              onPress={async () => {
                await Clipboard.setStringAsync(text);
                toast(t('ocr.copied'), 'success');
              }}
            />
            <TButton label={t('ocr.translate')} icon="translate" variant="outline" size="medium" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/ai-consent', params: { id, task: 'translate' } })} />
          </View>
        ) : null
      }
    >
      {text === null ? null : engineMissing || !text ? (
        <TEmpty icon="ocr" title={t('ocr.empty')} description={engineMissing ? t('ocr.engine_unavailable') : undefined} />
      ) : tab === 'layout' ? (
        <TEmpty icon="layers" title={t('common.comingSoon')} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
          <TSearch placeholder={t('ocr.search')} value={query} onChangeText={setQuery} />
          {query.trim() ? <TText variant="bodySmall" color="textSecondary">{String(hits)}</TText> : null}
          <TText variant="bodyLarge" selectable>
            {text}
          </TText>
        </ScrollView>
      )}
    </TScreen>
  );
}
