import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TDialog, TIcon, TNavigationBar, TTag, TText, useTheme, useToast } from '@/design-system';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { RedactionEngine } from '@/core/document-engine/redaction/RedactionEngine';
import { AIEngine, AiConsent, AiDeniedError, AiTaskId } from '@/core/document-engine/ai/AIEngine';
import { useFeature } from '@/core/config/remoteConfig';
import { useSettings } from '@/core/config/settingsStore';
import type { DocumentRecord } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Consent gate (spec §19, §57): Document → sensitive check → permission →
 * choose what to send → redaction → AI. Nothing is sent before this screen.
 */
export function AIConsentScreen() {
  const { id, task } = useLocalSearchParams<{ id: string; task: AiTaskId }>();
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const aiFeature = useFeature('ai');
  const allowAI = useSettings((s) => s.privacy.allowAI);
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [text, setText] = useState('');
  const [confirmOriginal, setConfirmOriginal] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    documentRepository.get(id).then(setDoc).catch(() => setDoc(null));
    documentRepository.ocrText(id).then(setText).catch(() => setText(''));
    track('ai_consent_shown', { task: task ?? 'unknown' });
  }, [id, task]);

  const piiCount = useMemo(() => RedactionEngine.detect(text).length, [text]);

  const send = async (mode: AiConsent['mode']) => {
    if (!id || !task) return;
    track('ai_consent_result', { task, mode });
    if (!aiFeature || !allowAI) {
      toast(aiFeature ? t('ai.off_body') : t('ai.unavailable'));
      return router.back();
    }
    setSending(true);
    try {
      await AIEngine.run({
        allowAI,
        documentId: id,
        task,
        text,
        locale: i18n.language,
        consent: { documentId: id, task, mode, originalConfirmed: mode === 'original', grantedAt: Date.now() },
      });
      router.back();
    } catch (e) {
      toast(e instanceof AiDeniedError ? t('ai.off_body') : t('errors.generic'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgContainer, paddingBottom: insets.bottom }}>
      <TNavigationBar title={t('aiConsent.title')} left={<TButton label={t('common.cancel')} variant="text" size="small" onPress={() => router.back()} />} divider />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
        <TText variant="bodyLarge">{t('aiConsent.body')}</TText>
        {doc ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
            <TIcon name="documents" color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <TText variant="body" weight="600" numberOfLines={1}>
                {doc.title}
              </TText>
              <TText variant="bodySmall" color="textSecondary">
                {t('common.pages', { count: doc.pageCount })}
              </TText>
            </View>
          </View>
        ) : null}
        {piiCount > 0 ? <TTag theme="warning" icon="shield" label={t('aiConsent.detected', { count: piiCount })} /> : <TTag theme="success" icon="shield" label={t('sensitive.none')} />}
      </ScrollView>
      <View style={{ padding: spacing.md, gap: spacing.xs }}>
        <TButton testID="ai-redact-continue" label={`${t('aiConsent.redact_continue')} · ${t('common.recommended')}`} icon="redact" block loading={sending} onPress={() => send('redacted')} />
        <TButton label={t('aiConsent.send_original')} variant="outline" block disabled={sending} onPress={() => setConfirmOriginal(true)} />
      </View>
      <TDialog
        visible={confirmOriginal}
        title={t('aiConsent.send_original_confirm_title')}
        content={t('aiConsent.send_original_confirm_body')}
        onRequestClose={() => setConfirmOriginal(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmOriginal(false) },
          {
            label: t('aiConsent.send_original_confirm'),
            tone: 'danger',
            onPress: () => {
              setConfirmOriginal(false);
              void send('original');
            },
          },
        ]}
      />
    </View>
  );
}
