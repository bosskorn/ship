import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { Camera } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconName, TButton, TIcon, TTag, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';

type CameraState = 'unknown' | 'granted' | 'ask' | 'blocked';

/**
 * Shown once after onboarding (and once after updating): what OneScan may access and why.
 * Only the camera needs a runtime permission. Photos and files go through the system picker
 * (no permission), and OneScan never asks for SMS, contacts, location or the microphone.
 * Skipping is always possible: the scanner asks again when it is opened.
 */
export function PermissionsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const done = useSettings((s) => s.completePermissionsIntro);
  const [camera, setCamera] = useState<CameraState>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Camera.getCameraPermissionsAsync()
      .then((p) => alive && setCamera(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked'))
      .catch(() => alive && setCamera('ask'));
    return () => {
      alive = false;
    };
  }, []);

  const allow = async () => {
    if (camera === 'granted') return done();
    if (camera === 'blocked') {
      void Linking.openSettings();
      return;
    }
    setBusy(true);
    try {
      const p = await Camera.requestCameraPermissionsAsync();
      setCamera(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked');
      if (p.granted) done();
    } catch {
      done();
    } finally {
      setBusy(false);
    }
  };

  // Android 13+ has the system photo picker; older versions use the document picker. Neither needs a permission.
  const modernPicker = Platform.OS !== 'android' || Number(Platform.Version) >= 33;
  const rows: { key: string; icon: IconName; title: string; body: string; state: 'granted' | 'needed' | 'none' }[] = [
    {
      key: 'camera',
      icon: 'camera',
      title: t('permissions.camera_title'),
      body: t('permissions.camera_body'),
      state: camera === 'granted' ? 'granted' : 'needed',
    },
    {
      key: 'files',
      icon: 'gallery',
      title: t('permissions.files_title'),
      body: t(modernPicker ? 'permissions.files_body_picker' : 'permissions.files_body_legacy'),
      state: 'none',
    },
  ];

  return (
    <View testID="permissions" style={{ flex: 1, backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.lg, gap: spacing.md }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
          <TIcon name="shield" size={28} color={colors.brand} />
        </View>
        <TText variant="headline" weight="700" accessibilityRole="header">
          {t('permissions.title')}
        </TText>
        <TText variant="bodyLarge" color="textSecondary">
          {t('permissions.body')}
        </TText>

        <View style={{ borderRadius: radius.lg, backgroundColor: colors.bgSecondary, marginTop: spacing.xs }}>
          {rows.map((r, i) => (
            <View
              key={r.key}
              testID={`permission-${r.key}`}
              style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgContainer, alignItems: 'center', justifyContent: 'center' }}>
                <TIcon name={r.icon} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
                  <TText variant="title">{r.title}</TText>
                  {r.state === 'granted' ? (
                    <TTag label={t('permissions.granted')} theme="success" icon="check" />
                  ) : r.state === 'needed' ? (
                    <TTag label={t('permissions.needed')} theme="brand" />
                  ) : (
                    <TTag label={t('permissions.not_needed')} />
                  )}
                </View>
                <TText variant="body" color="textSecondary">
                  {r.body}
                </TText>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <TIcon name="lock" size={16} color={colors.textSecondary} />
          <TText variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
            {t('permissions.never')}
          </TText>
        </View>
        {camera === 'blocked' ? (
          <TText variant="bodySmall" color="warning">
            {t('permissions.blocked')}
          </TText>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        <TButton
          testID="permissions-allow"
          label={camera === 'granted' ? t('permissions.continue') : camera === 'blocked' ? t('permissions.open_settings') : t('permissions.allow_camera')}
          block
          loading={busy}
          disabled={busy || camera === 'unknown'}
          onPress={allow}
        />
        {camera !== 'granted' ? <TButton testID="permissions-later" label={t('permissions.later')} variant="text" block onPress={done} /> : null}
      </View>
    </View>
  );
}
