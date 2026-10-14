import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCellGroup, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { cleanFilePrefix, DEFAULT_FILE_PREFIX, MAX_FILE_PREFIX, scanFileName } from '@/features/scanner/fileName';

/** Name for new scans: the user's prefix (default "OneScan") + the scan date and time. */
export function FileNameScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius, typeScale, fontFamily } = useTheme();
  const saved = useSettings((s) => s.fileNamePrefix);
  const setPrefix = useSettings((s) => s.setFileNamePrefix);
  const [value, setValue] = useState(saved);
  const clean = cleanFilePrefix(value);
  const save = () => {
    setPrefix(clean);
    router.back();
  };

  return (
    <TScreen scroll header={<TNavigationBar title={t('file_name.title')} onBack={() => router.back()} />}>
      <TCellGroup title={t('file_name.prefix')} footer={t('file_name.footer')}>
        <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <TextInput
            testID="file-name-prefix"
            value={value}
            onChangeText={setValue}
            placeholder={DEFAULT_FILE_PREFIX}
            placeholderTextColor={colors.textPlaceholder}
            maxLength={MAX_FILE_PREFIX}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={save}
            style={{
              ...typeScale.bodyLarge,
              fontFamily,
              color: colors.textPrimary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              backgroundColor: colors.bgContainer,
            }}
          />
        </View>
      </TCellGroup>
      <TCellGroup title={t('file_name.example')}>
        <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <TText testID="file-name-preview" variant="bodyLarge" weight="500">
            {scanFileName(clean)}.pdf
          </TText>
        </View>
      </TCellGroup>
      <View style={{ padding: spacing.md, gap: spacing.xs }}>
        <TButton testID="file-name-save" label={t('common.save')} block onPress={save} />
        <TButton label={t('file_name.reset')} variant="text" block onPress={() => setValue('')} />
      </View>
    </TScreen>
  );
}
