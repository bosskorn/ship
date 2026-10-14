import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconName, TIcon, TScreen, TText, TTopAppBar, useTheme } from '@/design-system';
import { openScanner } from '@/features/home/HomeScreen';
import { useImport } from '@/features/shared/useImport';

interface Tool {
  key: string;
  label: string;
  icon: IconName;
  run: () => void;
}

/**
 * Tools (design V2, frozen): only entry points that start from nothing. Anything that needs a
 * document first (crop, rotate, pages, share) starts from that document; other camera modes
 * are chosen inside the camera. Do not add tiles to fill the screen.
 */
export function ToolsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();

  const sections: { title: string; tools: Tool[] }[] = [
    {
      title: t('tools.section_scan'),
      tools: [
        { key: 'id', label: t('tools.scan_id'), icon: 'idCard', run: () => openScanner({ mode: 'id', docType: 'id_card', source: 'tools' }) },
        { key: 'receipt', label: t('tools.scan_receipt'), icon: 'receipt', run: () => openScanner({ mode: 'receipt', docType: 'receipt', source: 'tools' }) },
      ],
    },
    {
      title: t('tools.section_import'),
      tools: [
        { key: 'image_to_pdf', label: t('tools.import_photos'), icon: 'importPhoto', run: () => void importPhotos() },
        { key: 'import_pdf', label: t('tools.import_pdf'), icon: 'importPdf', run: importPdf },
      ],
    },
  ];

  return (
    <TScreen scroll surface="container" footer={importOverlay} header={<TTopAppBar title={t('tools.title')} />}>
      {sections.map((s) => (
        <View key={s.title}>
          <TText variant="body" weight="600" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xs }}>
            {s.title}
          </TText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }}>
            {s.tools.map((tool) => (
              <Pressable
                key={tool.key}
                testID={`tool-${tool.key}`}
                accessibilityRole="button"
                accessibilityLabel={tool.label}
                onPress={tool.run}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 112,
                  padding: spacing.md,
                  gap: spacing.sm,
                  borderRadius: 18,
                  backgroundColor: pressed ? colors.bgPressed : colors.bgSecondary,
                })}
              >
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                  <TIcon name={tool.icon} color={colors.brand} />
                </View>
                <TText variant="bodyLarge" weight="500" numberOfLines={2}>
                  {tool.label}
                </TText>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </TScreen>
  );
}
