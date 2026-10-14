import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { IconName, TButton, TIcon, TScreen, TSectionHeader, TText, TTopAppBar, useTheme } from '@/design-system';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentPaper, useDocumentMeta } from '@/features/documents/DocumentListItem';
import { useScanSession } from '@/features/scanner/scanSession';
import { useImport } from '@/features/shared/useImport';
import { Wordmark } from '@/features/shared/Wordmark';
import type { CaptureMode, DocumentRecord, DocumentType } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';

export function openScanner(opts?: { mode?: CaptureMode; docType?: DocumentType; source?: string }) {
  useScanSession.getState().start(opts);
  track('scan_started', { source: opts?.source ?? 'home', mode: opts?.mode ?? 'auto' });
  router.push('/scanner');
}

const openDoc = (d: DocumentRecord) => router.push({ pathname: '/document/[id]', params: { id: d.id } });

/** One recent document: the page itself, with weight (stacked when multi-page). */
function RecentCard({ doc }: { doc: DocumentRecord }) {
  const { spacing } = useTheme();
  const meta = useDocumentMeta(doc, { pages: false });
  return (
    <Pressable testID={`recent-${doc.id}`} accessibilityRole="button" accessibilityLabel={`${doc.title}, ${meta}`} onPress={() => openDoc(doc)} style={({ pressed }) => ({ width: 152, opacity: pressed ? 0.75 : 1 })}>
      <DocumentPaper doc={doc} width={152} height={204} />
      <TText variant="body" weight="500" numberOfLines={1} style={{ marginTop: spacing.xs }}>
        {doc.title}
      </TText>
      <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
        {meta}
      </TText>
    </Pressable>
  );
}

/** Zero documents: two stacked sheets inside the blue corner marks of a found page. */
function FirstDocArt() {
  const { colors } = useTheme();
  return (
    <Svg width={148} height={120} viewBox="0 0 148 120">
      <G transform="translate(26 14) rotate(-8)">
        <Rect width={66} height={88} rx={4} fill={colors.bgPressed} />
      </G>
      <G transform="translate(46 10)">
        <Rect width={66} height={88} rx={4} fill="#FFFFFF" stroke={colors.border} />
        <Rect x={12} y={12} width={28} height={5} rx={2} fill={colors.brand} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Rect key={i} x={12} y={26 + i * 8} width={42 * [1, 0.8, 0.9, 0.6][i % 4]} height={3.2} rx={1.6} fill="#C7CEDA" />
        ))}
      </G>
      <Path d="M38 30v-10a6 6 0 0 1 6-6h10M104 14h10a6 6 0 0 1 6 6v10M120 88v10a6 6 0 0 1-6 6h-10M54 104H44a6 6 0 0 1-6-6V88" stroke={colors.brand} strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Home is the workspace (design V2, frozen): the user's recent documents, then four quick
 * starts. Scan is the round action in the navigation bar. No hero, benefits, privacy card
 * or marketing copy here, however empty the screen feels.
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const recent = useDocuments((s) => s.recent);
  const refresh = useDocuments((s) => s.refresh);
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const quick: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'photo', label: t('home.quick_import'), icon: 'importPhoto', onPress: () => importPhotos() },
    { key: 'pdf', label: t('home.quick_pdf'), icon: 'importPdf', onPress: importPdf },
    { key: 'id', label: t('home.quick_id'), icon: 'idCard', onPress: () => openScanner({ mode: 'id', docType: 'id_card', source: 'quick_id' }) },
    { key: 'receipt', label: t('home.quick_receipt'), icon: 'receipt', onPress: () => openScanner({ docType: 'receipt', source: 'quick_receipt' }) },
  ];
  const empty = recent.length === 0;

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
          leading={<Wordmark />}
          actions={[
            { icon: 'search', label: t('home.search_placeholder'), onPress: () => router.push('/search'), testID: 'home-search' },
            { icon: 'profile', label: t('profile.title'), onPress: () => router.navigate('/profile') },
          ]}
        />
      }
    >
      {empty ? (
        <View testID="home-empty" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xl, gap: spacing.xs }}>
          <FirstDocArt />
          <TText variant="titleLarge" weight="600" align="center" style={{ marginTop: spacing.sm }}>
            {t('home.empty_title')}
          </TText>
          <TText variant="body" color="textSecondary" align="center">
            {t('home.empty_body')}
          </TText>
          <TButton testID="home-scan" label={t('home.scan_document')} icon="camera" onPress={() => openScanner({ source: 'home_empty' })} style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl, borderRadius: 24 }} />
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs }}>
            <TButton label={t('home.quick_import')} icon="importPhoto" variant="text" size="medium" onPress={() => importPhotos()} />
            <TButton label={t('home.quick_pdf')} icon="importPdf" variant="text" size="medium" onPress={importPdf} />
          </View>
        </View>
      ) : (
        <>
          <TSectionHeader title={t('home.recent')} actionLabel={t('common.seeAll')} onAction={() => router.navigate('/documents')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xxs, paddingBottom: spacing.sm }}>
            {recent.map((doc) => (
              <RecentCard key={doc.id} doc={doc} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
            {quick.map((q) => (
              <Pressable
                key={q.key}
                testID={`quick-${q.key}`}
                accessibilityRole="button"
                accessibilityLabel={q.label}
                onPress={q.onPress}
                style={({ pressed }) => ({ width: 80, alignItems: 'center', gap: spacing.xs, opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <TIcon name={q.icon} color={colors.textPrimary} />
                </View>
                <TText variant="bodySmall" align="center" numberOfLines={2}>
                  {q.label}
                </TText>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </TScreen>
  );
}
