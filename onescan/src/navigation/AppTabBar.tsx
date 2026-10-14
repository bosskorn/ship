import React, { ComponentProps } from 'react';
import { Tabs, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TBottomNavigation, TBottomNavItem } from '@/design-system';
import { useScanSession } from '@/features/scanner/scanSession';
import { track } from '@/services/analytics/analytics';
import { useFeature } from '@/core/config/remoteConfig';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function startScan(source: string) {
  useScanSession.getState().start();
  track('scan_started', { source, mode: 'auto' });
  router.push('/scanner');
}

/**
 * App shell navigation (design V2, frozen): Home · Documents · SCAN · Tools · Me.
 * Scan is an action, not a destination: one tap opens the camera; modes are chosen there.
 */
export function AppTabBar({ state, navigation, insets }: TabBarProps) {
  const { t } = useTranslation();
  const aiEnabled = useFeature('ai');
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
    <TBottomNavigation
      items={items}
      activeKey={activeKey}
      bottomInset={insets.bottom}
      onPress={(key) => {
        if (key === 'scan') return startScan('tab');
        const route = state.routes.find((r) => r.name === key);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented && key !== activeKey) navigation.navigate(route.name);
      }}
    />
  );
}
