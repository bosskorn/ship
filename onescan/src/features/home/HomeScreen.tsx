import React, { useCallback } from 'react';
import { Image, Pressable, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  IconName, TButton, TDivider, TIcon, TIconButton, TScreen, TSectionHeader, TText, useTheme,
} from '@/design-system';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentListItem } from '@/features/documents/DocumentListItem';
import { useDocumentActions } from '@/features/documents/useDocumentActions';
import { useScanSession } from '@/features/scanner/scanSession';
import { useImport } from '@/features/shared/useImport';
import type { CaptureMode, DocumentType } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';

export function openScanner(opts?: { mode?: CaptureMode; docType?: DocumentType; source?: string }) {
  useScanSession.getState().start(opts);
  track('scan_started', { source: opts?.source ?? 'home', mode: opts?.mode ?? 'auto' });
  router.push('/scanner');
}

const logo = require('../../../assets/splash-icon.png');

const benefits = [
  { key: 'sharp', icon: 'scan' },
  { key: 'search', icon: 'search' },
  { key: 'pdf', icon: 'share' },
] as const satisfies readonly { key: string; icon: IconName }[];

/**
 * Home: what OneScan does (hero), the one primary action (scan), the benefits, a quiet
 * trust note, then the user's recent work. No boxes around everything: sections are
 * separated by space and type hierarchy on one surface.
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const recent = useDocuments((s) => s.recent);
  const refresh = useDocuments((s) => s.refresh);
  const actions = useDocumentActions();
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();
  // Hero type steps up on wide phones; system font scaling applies on top.
  const heroSize = width >= 400 ? { fontSize: 34, lineHeight: 46 } : { fontSize: 28, lineHeight: 40 };
  const gutter = spacing.md;

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
    <TScreen scroll surface="container" footer={importOverlay}>
      {/* Top bar: wordmark + search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingStart: gutter, paddingEnd: spacing.xs }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Image testID="home-logo" source={logo} style={{ width: 28, height: 28 }} accessible={false} />
          <TText variant="title" weight="700">
            OneScan
          </TText>
        </View>
        <TIconButton testID="home-search" icon="search" accessibilityLabel={t('home.search_placeholder')} onPress={() => router.push('/search')} />
      </View>

      {/* Hero */}
      <View style={{ paddingHorizontal: gutter, paddingTop: spacing.xl, paddingBottom: spacing.xxl }}>
        <TText variant="headline" weight="700" accessibilityRole="header" style={[heroSize, { letterSpacing: -0.3 }]}>
          {t('home.hero_title')}
        </TText>
        <TText variant="bodyLarge" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {t('home.hero_body')}
        </TText>
        <TText variant="body" weight="600" color="success" style={{ marginTop: spacing.xxs }}>
          {t('home.hero_free')}
        </TText>
        <TButton
          testID="home-scan"
          label={t('home.scan_document')}
          icon="camera"
          size="large"
          block
          onPress={() => openScanner()}
          style={{ marginTop: spacing.xl, height: 56 }}
        />
      </View>

      {/* Benefits */}
      <View style={{ paddingHorizontal: gutter, gap: spacing.lg }}>
        {benefits.map((b) => (
          <View key={b.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
              <TIcon name={b.icon} size="md" color={colors.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TText variant="title">{t(`home.benefit_${b.key}_title`)}</TText>
              <TText variant="body" color="textSecondary">
                {t(`home.benefit_${b.key}_body`)}
              </TText>
            </View>
          </View>
        ))}
      </View>

      {/* Trust: after the benefits, never the headline */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          marginHorizontal: gutter,
          marginTop: spacing.xxl,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.bgSecondary,
        }}
      >
        <TIcon name="shield" size="md" color={colors.success} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <TText variant="body" weight="600">
            {t('home.trust_title')}
          </TText>
          <TText variant="bodySmall" color="textSecondary">
            {t('home.trust_body')}
          </TText>
        </View>
      </View>

      {/* Recent work, or a first-document invitation */}
      {recent.length ? <TSectionHeader title={t('home.recent')} actionLabel={t('common.seeAll')} onAction={() => router.push('/documents')} /> : null}
      {recent.length === 0 ? (
        <View testID="home-empty" style={{ paddingHorizontal: gutter, paddingTop: spacing.xxl, paddingBottom: spacing.md, gap: spacing.xxs }}>
          <TText variant="bodyLarge" weight="600">
            {t('home.empty_title')}
          </TText>
          <TText variant="body" color="textSecondary">
            {t('home.empty_body')}
          </TText>
          <TButton
            testID="home-empty-scan"
            label={t('home.empty_cta')}
            icon="scan"
            variant="outline"
            size="medium"
            onPress={() => openScanner({ source: 'home_empty' })}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
          />
        </View>
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

      {/* Shortcuts: secondary, below the user's own documents */}
      <TSectionHeader title={t('home.quick_actions')} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xs, paddingTop: spacing.xs }}>
        {quick.map((q) => (
          <Pressable
            key={q.key}
            testID={`quick-${q.key}`}
            accessibilityRole="button"
            accessibilityLabel={q.label}
            onPress={q.onPress}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: spacing.xs, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
              <TIcon name={q.icon} color={colors.textPrimary} />
            </View>
            <TText variant="bodySmall" align="center" numberOfLines={2} style={{ paddingHorizontal: 2 }}>
              {q.label}
            </TText>
          </Pressable>
        ))}
      </View>
      {actions.element}
    </TScreen>
  );
}
