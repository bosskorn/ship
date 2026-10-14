import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconName, TIcon, TScreen, TSearch, TText, TTopAppBar, useTheme } from '@/design-system';
import { openScanner } from '@/features/home/HomeScreen';
import { useImport } from '@/features/shared/useImport';

type Tint = 'brand' | 'success' | 'warning' | 'info';

interface Tool {
  key: string;
  label: string;
  icon: IconName;
  run: () => void;
}

interface Category {
  key: string;
  title: string;
  tint: Tint;
  tools: Tool[];
}

/** The search field appears once the catalogue is big enough to need it. */
const SEARCH_FROM = 12;

/**
 * Tools: a catalogue of entry points that start from nothing, grouped by category, four to a
 * row. Built to grow: add a tool to a category (or a new category) and the layout follows.
 * Only working tools are listed — nothing "coming soon".
 */
export function ToolsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const { importPdf, importPhotos, overlay: importOverlay } = useImport();
  const [query, setQuery] = useState('');

  const categories: Category[] = [
    {
      key: 'scan',
      title: t('tools.section_scan'),
      tint: 'brand',
      tools: [
        { key: 'document', label: t('tools.document'), icon: 'scan', run: () => openScanner({ source: 'tools' }) },
        { key: 'id', label: t('tools.id'), icon: 'idCard', run: () => openScanner({ mode: 'id', docType: 'id_card', source: 'tools' }) },
        { key: 'receipt', label: t('tools.receipt'), icon: 'receipt', run: () => openScanner({ mode: 'receipt', docType: 'receipt', source: 'tools' }) },
      ],
    },
    {
      key: 'import',
      title: t('tools.section_import'),
      tint: 'success',
      tools: [
        { key: 'image_to_pdf', label: t('tools.image_to_pdf'), icon: 'importPhoto', run: () => void importPhotos() },
        { key: 'import_pdf', label: t('tools.import_pdf'), icon: 'importPdf', run: importPdf },
      ],
    },
  ];
  const total = categories.reduce((n, c) => n + c.tools.length, 0);
  const q = query.trim().toLowerCase();
  const shown = q ? categories.map((c) => ({ ...c, tools: c.tools.filter((x) => x.label.toLowerCase().includes(q)) })).filter((c) => c.tools.length) : categories;
  const tints: Record<Tint, [string, string]> = {
    brand: [colors.brandLight, colors.brand],
    success: [colors.successLight, colors.success],
    warning: [colors.warningLight, colors.warning],
    info: [colors.infoLight, colors.info],
  };

  return (
    <TScreen scroll surface="container" footer={importOverlay} header={<TTopAppBar title={t('tools.title')} />} contentStyle={{ paddingBottom: spacing.xxl }}>
      {/* Main action: start a scan. */}
      <Pressable
        testID="tool-featured-scan"
        accessibilityRole="button"
        accessibilityLabel={t('tools.featured_title')}
        onPress={() => openScanner({ source: 'tools_featured' })}
        style={({ pressed }) => ({
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          padding: spacing.lg,
          borderRadius: radius.lg + 4,
          backgroundColor: colors.brand,
          opacity: pressed ? 0.88 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        })}
      >
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <TText variant="titleLarge" style={{ color: colors.textAnti }}>
            {t('tools.featured_title')}
          </TText>
          <TText variant="body" style={{ color: colors.textAnti, opacity: 0.85 }}>
            {t('tools.featured_body')}
          </TText>
        </View>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <TIcon name="camera" size={28} color={colors.textAnti} />
        </View>
      </Pressable>

      {total >= SEARCH_FROM ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <TSearch value={query} onChangeText={setQuery} placeholder={t('tools.search')} />
        </View>
      ) : null}

      {shown.map((c) => {
        const [bg, fg] = tints[c.tint];
        return (
          <View key={c.key} testID={`tools-${c.key}`} style={{ marginTop: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
              <TText variant="title" accessibilityRole="header">
                {c.title}
              </TText>
              <TText variant="bodySmall" color="textPlaceholder">
                {t('tools.count', { count: c.tools.length })}
              </TText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.xs }}>
              {c.tools.map((tool) => (
                <Pressable
                  key={tool.key}
                  testID={`tool-${tool.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={tool.label}
                  onPress={tool.run}
                  style={({ pressed }) => ({ width: '25%', alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: 2, gap: spacing.xs, opacity: pressed ? 0.6 : 1 })}
                >
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                    <TIcon name={tool.icon} size={26} color={fg} />
                  </View>
                  <TText variant="bodySmall" weight="500" align="center" numberOfLines={2}>
                    {tool.label}
                  </TText>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </TScreen>
  );
}
