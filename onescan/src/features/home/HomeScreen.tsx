import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  IconName, TButton, TDivider, TEmpty, TIcon, TIconButton, TScreen, TSearch, TSectionHeader, TText, useTheme,
} from '@/design-system';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentListItem } from '@/features/documents/DocumentListItem';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { useScanSession } from '@/features/scanner/scanSession';
import { useImport } from '@/features/shared/useImport';
import type { CaptureMode, DocumentType } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';

function greetingKey(h: number) {
  if (h < 12) return 'home.greeting_morning' as const;
  if (h < 18) return 'home.greeting_afternoon' as const;
  return 'home.greeting_evening' as const;
}

export function openScanner(opts?: { mode?: CaptureMode; docType?: DocumentType; source?: string }) {
  useScanSession.getState().start(opts);
  track('scan_started', { source: opts?.source ?? 'home', mode: opts?.mode ?? 'document' });
  router.push('/scanner');
}

export function HomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const recent = useDocuments((s) => s.recent);
  const refresh = useDocuments((s) => s.refresh);
  const actions = useDocumentActions();
  const { importPdf, importPhotos } = useImport();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const quick: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'pdf', label: t('home.import_pdf'), icon: 'importPdf', onPress: importPdf },
    { key: 'photo', label: t('home.import_photo'), icon: 'importPhoto', onPress: () => importPhotos() },
    { key: 'id', label: t('home.scan_id'), icon: 'idCard', onPress: () => openScanner({ mode: 'id', docType: 'id_card', source: 'quick_id' }) },
    { key: 'receipt', label: t('home.scan_receipt'), icon: 'receipt', onPress: () => openScanner({ docType: 'receipt', source: 'quick_receipt' }) },
    { key: 'more', label: t('home.more_tools'), icon: 'more', onPress: () => router.push('/tools') },
  ];

  return (
    <TScreen scroll>
      {/* Header */}
      <View style={{ backgroundColor: colors.bgContainer, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
          <TText variant="titleLarge" style={{ flex: 1 }} accessibilityRole="header">
            {t(greetingKey(new Date().getHours()))}
          </TText>
          <TIconButton icon="bell" accessibilityLabel={t('home.notifications')} onPress={() => router.push('/unavailable')} />
        </View>
        <TSearch testID="home-search" placeholder={t('home.search_placeholder')} onPressEntry={() => router.push('/search')} />
      </View>

      {/* Primary scan area: the single most prominent action */}
      <View style={{ backgroundColor: colors.bgContainer, marginTop: spacing.xs, padding: spacing.md, gap: spacing.sm }}>
        <TButton testID="home-scan" label={t('home.scan_document')} icon="scan" size="large" block onPress={() => openScanner()} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing.md, rowGap: spacing.xxs }}>
          {(
            [
              ['home.badge_auto', 'scan'],
              ['home.badge_local', 'devices'],
              ['home.badge_private', 'shield'],
            ] as const
          ).map(([key, icon]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TIcon name={icon} size={14} color={colors.success} />
              <TText variant="bodySmall" color="textSecondary">
                {t(key)}
              </TText>
            </View>
          ))}
        </View>
      </View>

      {/* Quick actions */}
      <TSectionHeader title={t('home.quick_actions')} />
      <View style={{ flexDirection: 'row', backgroundColor: colors.bgContainer, paddingVertical: spacing.md }}>
        {quick.map((q) => (
          <Pressable
            key={q.key}
            testID={`quick-${q.key}`}
            accessibilityRole="button"
            onPress={q.onPress}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: spacing.xs, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
              <TIcon name={q.icon} color={colors.brand} />
            </View>
            <TText variant="bodySmall" align="center" numberOfLines={2} style={{ paddingHorizontal: 2 }}>
              {q.label}
            </TText>
          </Pressable>
        ))}
      </View>

      {/* Recent documents */}
      <TSectionHeader title={t('home.recent')} actionLabel={recent.length ? t('common.seeAll') : undefined} onAction={() => router.push('/documents')} />
      <View style={{ backgroundColor: colors.bgContainer }}>
        {recent.length === 0 ? (
          <TEmpty icon="documents" title={t('home.recent_empty')} description={t('home.recent_empty_hint')} />
        ) : (
          recent.map((doc, i) => (
            <React.Fragment key={doc.id}>
              {i > 0 ? <TDivider inset={spacing.md + 44 + spacing.sm} /> : null}
              <DocumentListItem
                doc={doc}
                onPress={(d) => router.push({ pathname: '/document/[id]', params: { id: d.id } })}
                onMore={actions.open}
              />
            </React.Fragment>
          ))
        )}
      </View>
      {actions.element}
    </TScreen>
  );
}
