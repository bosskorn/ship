import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TSwitch, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { useFeature } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';

/** Privacy & Data (spec §29). Defaults: on-device ON (locked), AI OFF, auto upload OFF. */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const privacy = useSettings((s) => s.privacy);
  const setPrivacy = useSettings((s) => s.setPrivacy);
  const aiEnabled = useFeature('ai');
  const cloudEnabled = useFeature('cloudBackup');
  // Nothing is collected in 1.2.0 (no analytics transport, no crash SDK): switches hidden.
  const telemetryEnabled = useFeature('telemetrySettings');
  const set = (key: 'allowAI' | 'autoCloudUpload' | 'usageAnalytics' | 'crashReports') => (v: boolean) => {
    setPrivacy({ [key]: v });
    track('settings_changed', { setting: key, value: v });
  };

  return (
    <TScreen scroll header={<TNavigationBar title={t('privacy.title')} onBack={() => router.back()} />}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.successLight }}>
        <TIcon name="shield" size="md" color={colors.success} />
        <TText variant="body" style={{ flex: 1 }}>
          {t('privacy.principle')}
        </TText>
      </View>

      <TCellGroup title={t('privacy.section_processing')}>
        <TCell title={t('privacy.on_device')} description={t('privacy.on_device_desc')} right={<TSwitch value disabled onValueChange={() => {}} accessibilityLabel={t('privacy.on_device')} />} />
      </TCellGroup>
      {aiEnabled ? (
        <TCellGroup title={t('privacy.section_ai')}>
          <TCell
            title={t('privacy.allow_ai')}
            description={t('privacy.allow_ai_desc')}
            right={<TSwitch testID="privacy-ai" value={privacy.allowAI} onValueChange={set('allowAI')} accessibilityLabel={t('privacy.allow_ai')} />}
          />
        </TCellGroup>
      ) : null}
      {cloudEnabled ? (
        <TCellGroup title={t('privacy.section_cloud')}>
          <TCell
            title={t('privacy.auto_upload')}
            description={t('privacy.auto_upload_desc')}
            // Cloud backup ships in V1.3; until then auto upload cannot be enabled.
            right={<TSwitch value={false} disabled onValueChange={set('autoCloudUpload')} accessibilityLabel={t('privacy.auto_upload')} />}
          />
        </TCellGroup>
      ) : null}
      {telemetryEnabled ? (
        <TCellGroup title={t('privacy.section_diagnostics')}>
          <TCell title={t('privacy.analytics')} description={t('privacy.analytics_desc')} right={<TSwitch value={privacy.usageAnalytics} onValueChange={set('usageAnalytics')} accessibilityLabel={t('privacy.analytics')} />} />
          <TCell title={t('privacy.crash')} description={t('privacy.crash_desc')} right={<TSwitch value={privacy.crashReports} onValueChange={set('crashReports')} accessibilityLabel={t('privacy.crash')} />} />
        </TCellGroup>
      ) : null}
    </TScreen>
  );
}
