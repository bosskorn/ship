import React, { ComponentProps, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TActionSheet, TBottomNavigation, TBottomNavItem } from '@/design-system';
import { useScanSession } from '@/features/scanner/scanSession';
import { useImport } from '@/features/shared/useImport';
import type { CaptureMode, DocumentType } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';
import { useFeature } from '@/core/config/remoteConfig';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function startScan(source: string, opts?: { mode?: CaptureMode; docType?: DocumentType }) {
  useScanSession.getState().start(opts);
  track('scan_started', { source, mode: opts?.mode ?? 'auto' });
  router.push('/scanner');
}

/**
 * App shell navigation: Home · Documents · SCAN · Tools · Me. Scan is an action, not a
 * destination: one tap opens the camera; a long press offers the other ways to start.
 */
export function AppTabBar({ state, navigation, insets }: TabBarProps) {
  const { t } = useTranslation();
  const aiEnabled = useFeature('ai');
  const [sheet, setSheet] = useState(false);
  const { importPdf, importPhotos, overlay } = useImport();
  const items: TBottomNavItem[] = [
    { key: 'index', label: t('tabs.home'), icon: 'home' },
    { key: 'documents', label: t('tabs.documents'), icon: 'documents' },
    { key: 'scan', label: t('tabs.scan'), icon: 'scan', primary: true },
    { key: 'tools', label: t('tabs.tools'), icon: 'grid' },
    // AI appears only when it ships (off in 1.2.0).
    ...(aiEnabled ? [{ key: 'ai', label: t('tabs.ai'), icon: 'ai' } as TBottomNavItem] : []),
    { key: 'profile', label: t('tabs.profile'), icon: 'profile' },
  ];
  const activeKey = state.routes[state.index]?.name ?? 'index';

  return (
    <>
      <TBottomNavigation
        items={items}
        activeKey={activeKey}
        bottomInset={insets.bottom}
        onLongPress={(key) => key === 'scan' && setSheet(true)}
        onPress={(key) => {
          if (key === 'scan') return startScan('tab');
          const route = state.routes.find((r) => r.name === key);
          if (!route) return;
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented && key !== activeKey) navigation.navigate(route.name);
        }}
      />
      <ScanSheet visible={sheet} onClose={() => setSheet(false)} onImportPhotos={() => void importPhotos()} onImportPdf={() => void importPdf()} />
      {overlay}
    </>
  );
}

/** Long press on Scan: every way to start a document, as a bottom sheet. */
export function ScanSheet({ visible, onClose, onImportPhotos, onImportPdf }: { visible: boolean; onClose: () => void; onImportPhotos: () => void; onImportPdf: () => void }) {
  const { t } = useTranslation();
  return (
    <TActionSheet
      visible={visible}
      title={t('scan_sheet.title')}
      cancelLabel={t('common.cancel')}
      onClose={onClose}
      items={[
        { key: 'document', label: t('scan_sheet.document'), icon: 'scan' },
        { key: 'id', label: t('scan_sheet.id'), icon: 'idCard' },
        { key: 'receipt', label: t('scan_sheet.receipt'), icon: 'receipt' },
        { key: 'photos', label: t('scan_sheet.photos'), icon: 'importPhoto' },
        { key: 'pdf', label: t('scan_sheet.pdf'), icon: 'importPdf' },
      ]}
      onSelect={(key) => {
        onClose();
        if (key === 'document') startScan('scan_sheet');
        else if (key === 'id') startScan('scan_sheet', { mode: 'id', docType: 'id_card' });
        else if (key === 'receipt') startScan('scan_sheet', { docType: 'receipt' });
        else if (key === 'photos') onImportPhotos();
        else onImportPdf();
      }}
    />
  );
}
