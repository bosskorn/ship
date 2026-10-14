import React, { useCallback, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  IconName, TButton, TDivider, TIcon, TScreen, TSearch, TSectionHeader, TText, TTopAppBar, useTheme,
} from '@/design-system';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentListItem } from '@/features/documents/DocumentListItem';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { useScanSession } from '@/features/scanner/scanSession';
import { useImport } from '@/features/shared/useImport';
import type { CaptureMode, DocumentType } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';

const logo = require('../../../assets/splash-icon.png');

export function openScanner(opts?: { mode?: CaptureMode; docType?: DocumentType; source?: string }) {
  useScanSession.getState().start(opts);
  track('scan_started', { source: opts?.source ?? 'home', mode: opts?.mode ?? 'auto' });
  router.push('/scanner');
}

/**
 * Home is the workspace: the user's recent documents and the quickest ways to add one.
 * No selling here (that is onboarding, About and the store listing). Scan is also the
 * centre button of the navigation bar, one tap from every main screen.
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const recent = useDocuments((s) => s.recent);
  const refresh = useDocuments((s) => s.refresh);
  const actions = useDocumentActions();
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const quick: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'photo', label: t('home.quick_import'), icon: 'importPhoto', onPress: () => importPhotos() },
    { key: 'id', label: t('home.quick_id'), icon: 'idCard', onPress: () => openScanner({ mode: 'id', docType: 'id_card', source: 'quick_id' }) },
    { key: 'receipt', label: t('home.quick_receipt'), icon: 'receipt', onPress: () => openScanner({ docType: 'receipt', source: 'quick_receipt' }) },
    { key: 'pdf', label: t('home.quick_pdf'), icon: 'importPdf', onPress: importPdf },
  ];
  const empty = recent.length === 0;

  const quickRow = (
    <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xs, paddingVertical: spacing.sm }}>
      {quick.map((q) => (
        <Pressable
          key={q.key}
          testID={`quick-${q.key}`}
          accessibilityRole="button"
          accessibilityLabel={q.label}
          onPress={q.onPress}
          style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxs, opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
            <TIcon name={q.icon} color={colors.brand} />
          </View>
          <TText variant="bodySmall" align="center" numberOfLines={2} style={{ paddingHorizontal: 2 }}>
            {q.label}
          </TText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <TScreen
      scroll
      surface="container"
      footer={importOverlay}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
      }}
      contentStyle={empty ? { flexGrow: 1 } : undefined}
      header={
        <TTopAppBar
          leading={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Image testID="home-logo" source={logo} style={{ width: 28, height: 28 }} accessible={false} />
              <TText variant="titleLarge" weight="700" style={{ fontSize: 22 }} accessibilityRole="header">
                OneScan
              </TText>
            </View>
          }
          actions={[
            { icon: 'search', label: t('home.search_placeholder'), onPress: () => router.push('/search'), testID: 'home-search' },
            { icon: 'settings', label: t('profile.title'), onPress: () => router.navigate('/profile') },
          ]}
        />
      }
    >
      {empty ? (
        <>
          {/* First document: one clear action in the middle of the screen. */}
          <View testID="home-empty" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl, gap: spacing.xs }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }}>
              <TIcon name="scan" size={40} color={colors.brand} />
            </View>
            <TText variant="titleLarge" weight="700" align="center">
              {t('home.empty_title')}
            </TText>
            <TText variant="body" color="textSecondary" align="center">
              {t('home.empty_body')}
            </TText>
            <TButton testID="home-scan" label={t('home.scan_document')} icon="camera" onPress={() => openScanner()} style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl, borderRadius: 24 }} />
          </View>
          <TDivider />
          {quickRow}
        </>
      ) : (
        <>
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xxs }}>
            <TSearch pill placeholder={t('home.search_placeholder')} onPressEntry={() => router.push('/search')} />
          </View>
          {quickRow}
          <TSectionHeader title={t('home.recent')} actionLabel={t('common.seeAll')} onAction={() => router.navigate('/documents')} />
          {recent.map((doc, i) => (
            <React.Fragment key={doc.id}>
              {i > 0 ? <TDivider inset={spacing.md + 44 + spacing.sm} /> : null}
              <DocumentListItem
                doc={doc}
                onPress={(d) => router.push({ pathname: '/document/[id]', params: { id: d.id } })}
                onMore={actions.open}
              />
            </React.Fragment>
          ))}
        </>
      )}
      {actions.element}
    </TScreen>
  );
}
