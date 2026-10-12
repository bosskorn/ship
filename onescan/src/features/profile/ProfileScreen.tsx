import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { supportedLanguages } from '@/core/i18n/languages';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const language = useSettings((s) => s.language);
  const appearance = useSettings((s) => s.appearance);
  const scanQuality = useSettings((s) => s.scanner.quality);
  const langLabel = language ? supportedLanguages.find((l) => l.code === language)?.nativeName : t('language.system');
  const go = (path: Parameters<typeof router.push>[0]) => () => router.push(path);

  return (
    <TScreen scroll header={<TNavigationBar large title={t('profile.title')} />}>
      {/* Guest account: login is optional (spec §47) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bgContainer }}>
        <View style={{ width: 48, height: 48, borderRadius: radius.round, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <TIcon name="profile" color={colors.textPlaceholder} />
        </View>
        <View style={{ flex: 1 }}>
          <TText variant="title">{t('profile.guest')}</TText>
          <TText variant="bodySmall" color="textSecondary">
            {t('profile.guest_desc')}
          </TText>
        </View>
        <TButton label={t('profile.sign_in')} size="small" variant="secondary" onPress={go('/unavailable')} />
      </View>

      <TCellGroup>
        <TCell icon="plan" title={t('profile.plan')} note={t('profile.plan_free')} arrow onPress={go('/pricing')} />
        <TCell icon="credits" title={t('profile.ai_credits')} note="—" arrow onPress={go('/unavailable')} />
        <TCell icon="storage" title={t('profile.storage')} note={t('profile.storage_local')} />
        <TCell icon="cloud" title={t('profile.cloud')} note={t('common.off')} arrow onPress={go('/cloud')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="shield" title={t('profile.privacy')} arrow onPress={go('/privacy')} testID="profile-privacy" />
        <TCell icon="lock" title={t('profile.security')} arrow onPress={go('/security')} />
        <TCell icon="devices" title={t('profile.devices')} arrow onPress={go('/unavailable')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="translate" title={t('profile.language')} note={langLabel} arrow onPress={go('/language')} />
        <TCell icon="appearance" title={t('profile.appearance')} note={t(`appearance.${appearance}`)} arrow onPress={go('/appearance')} />
        <TCell icon="camera" title={t('scan_quality.title')} note={t(`scan_quality.${scanQuality}`)} arrow onPress={go('/scan-quality')} />
        <TCell icon="bell" title={t('profile.notifications')} arrow onPress={go('/unavailable')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="help" title={t('profile.help')} arrow onPress={go('/unavailable')} />
        <TCell icon="info" title={t('profile.about')} arrow onPress={go('/about')} />
      </TCellGroup>
    </TScreen>
  );
}
