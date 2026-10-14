import React, { useRef, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TButton, TIcon, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { track } from '@/services/analytics/analytics';
import { Wordmark } from '@/features/shared/Wordmark';
import { FindVisual, PrivateVisual, ScanVisual } from './OnboardingVisuals';

interface Page {
  key: 'scan' | 'find' | 'private';
  title: string;
  body: string;
}

/**
 * First launch (design V2): three screens that show what OneScan does — scan, find &
 * share, on-device privacy — then Home. Selling happens here, never on Home.
 */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const complete = useSettings((s) => s.completeOnboarding);
  const list = useRef<FlatList<Page>>(null);
  const [index, setIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const titleSize = width >= 400 ? { fontSize: 28, lineHeight: 38 } : { fontSize: 25, lineHeight: 34 };
  const visualHeight = Math.max(240, Math.min(360, height * 0.4));

  const pages: Page[] = [
    { key: 'scan', title: t('onboarding.scan_title'), body: t('onboarding.scan_body') },
    { key: 'find', title: t('onboarding.find_title'), body: t('onboarding.find_body') },
    { key: 'private', title: t('onboarding.private_title'), body: t('onboarding.private_body') },
  ];
  const last = index === pages.length - 1;

  const finish = () => {
    track('onboarding_completed', { skipped: !last });
    complete();
  };
  const next = () => {
    if (last) return finish();
    list.current?.scrollToIndex({ index: index + 1 });
    setIndex(index + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Wordmark />
        </View>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={12} style={{ padding: spacing.xs }}>
            <TText variant="body" weight="600" color="brand">
              {t('onboarding.skip')}
            </TText>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        ref={list}
        data={pages}
        horizontal
        pagingEnabled
        style={{ flex: 1 }}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.key}
        // Pages are exactly one screen wide: "Next" can scroll before a page is measured.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: pageHeight || undefined, paddingHorizontal: spacing.lg }}>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{ height: visualHeight, borderRadius: 28, backgroundColor: colors.bgSecondary, marginTop: spacing.xxs, padding: spacing.xs }}
            >
              {item.key === 'scan' ? <ScanVisual /> : item.key === 'find' ? <FindVisual query={t('onboarding.find_example')} /> : <PrivateVisual label={t('onboarding.on_device')} />}
            </View>
            <TText variant="headline" weight="700" accessibilityRole="header" style={[titleSize, { marginTop: spacing.xl, letterSpacing: -0.3 }]}>
              {item.title}
            </TText>
            <TText variant="bodyLarge" color="textSecondary" style={{ marginTop: spacing.xs }}>
              {item.body}
            </TText>
            {item.key === 'private' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }}>
                {(['tag_device', 'tag_upload', 'tag_watermark'] as const).map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: spacing.sm, borderRadius: 16, backgroundColor: colors.bgSecondary }}>
                    <TIcon name="check" size="sm" color={colors.success} />
                    <TText variant="body" weight="500">
                      {t(`onboarding.${k}`)}
                    </TText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {pages.map((p, i) => (
            <View key={p.key} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.brand : colors.border }} />
          ))}
        </View>
        <TButton testID="onboarding-next" label={last ? t('onboarding.start') : t('onboarding.next')} onPress={next} style={{ borderRadius: 24, paddingHorizontal: spacing.xl }} />
      </View>
    </View>
  );
}
