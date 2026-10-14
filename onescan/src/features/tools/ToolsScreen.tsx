import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconName, TIcon, TScreen, TText, TTopAppBar, useTheme } from '@/design-system';
import { FeatureFlag, flagOn, useRemoteConfig } from '@/core/config/remoteConfig';
import type { CaptureMode, DocumentType } from '@/core/document-engine/model';
import { openScanner } from '@/features/home/HomeScreen';
import { useImport } from '@/features/shared/useImport';

interface Tool {
  key: string;
  label: string;
  icon: IconName;
  /** Shown only when this feature is on in the build (never as "coming soon"). */
  flag?: FeatureFlag;
  run: () => void;
}

/** Tools tab: a utility grid. Every tile does something now; nothing is advertised. */
export function ToolsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const flags = useRemoteConfig((s) => s.config.flags);
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();
  const scan = (mode: CaptureMode, docType: DocumentType) => () => openScanner({ mode, docType, source: 'tools' });

  const all: { title: string; tools: Tool[] }[] = [
    {
      title: t('tools.section_scan'),
      tools: [
        { key: 'document', label: t('tools.document'), icon: 'scan', run: scan('document', 'document') },
        { key: 'id', label: t('tools.id'), icon: 'idCard', run: scan('id', 'id_card') },
        { key: 'receipt', label: t('tools.receipt'), icon: 'receipt', run: scan('receipt', 'receipt') },
        { key: 'book', label: t('tools.book'), icon: 'book', run: scan('document', 'book') },
        { key: 'whiteboard', label: t('tools.whiteboard'), icon: 'whiteboard', run: scan('document', 'whiteboard') },
        { key: 'business_card', label: t('tools.business_card'), icon: 'businessCard', run: scan('id', 'business_card') },
      ],
    },
    {
      title: t('tools.section_import'),
      tools: [
        { key: 'import_pdf', label: t('tools.import_pdf'), icon: 'importPdf', run: importPdf },
        { key: 'image_to_pdf', label: t('tools.image_to_pdf'), icon: 'importPhoto', run: () => void importPhotos() },
      ],
    },
    {
      title: t('tools.section_ai'),
      tools: [
        { key: 'summarize', label: t('tools.summarize'), icon: 'ai', flag: 'ai', run: () => router.push('/ai') },
        { key: 'ask_pdf', label: t('tools.ask_pdf'), icon: 'chat', flag: 'ai', run: () => router.push('/ai') },
      ],
    },
  ];
  const sections = all
    .map((s) => ({ ...s, tools: s.tools.filter((tool) => !tool.flag || flagOn(flags, tool.flag)) }))
    .filter((s) => s.tools.length > 0);

  return (
    <TScreen scroll surface="container" footer={importOverlay} header={<TTopAppBar title={t('tools.title')} />}>
      {sections.map((s) => (
        <View key={s.title} style={{ marginBottom: spacing.sm }}>
          <TText variant="body" weight="600" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
            {s.title}
          </TText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.xs }}>
            {s.tools.map((tool) => (
              <Pressable
                key={tool.key}
                testID={`tool-${tool.key}`}
                accessibilityRole="button"
                accessibilityLabel={tool.label}
                onPress={tool.run}
                style={({ pressed }) => ({
                  width: '33.33%',
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  gap: spacing.xs,
                  borderRadius: 16,
                  backgroundColor: pressed ? colors.bgPressed : 'transparent',
                })}
              >
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                  <TIcon name={tool.icon} color={colors.brand} />
                </View>
                <TText variant="body" align="center" numberOfLines={2} style={{ paddingHorizontal: spacing.xxs }}>
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
