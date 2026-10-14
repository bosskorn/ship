import React, { useRef, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconName, TButton, TIcon, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { useFeature } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';

/** Three short pages, then straight to scanning. No login (spec §47–48). */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const complete = useSettings((s) => s.completeOnboarding);
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const aiEnabled = useFeature('ai');

  const pages: { icon: IconName; title: string; body: string }[] = [
    { icon: 'scan', title: t('onboarding.scan_title'), body: t('onboarding.scan_body') },
    { icon: 'shield', title: t('onboarding.private_title'), body: t('onboarding.private_body') },
    // AI page only when AI ships (off in 1.2.0).
    ...(aiEnabled ? [{ icon: 'ai' as IconName, title: t('onboarding.ai_title'), body: t('onboarding.ai_body') }] : []),
  ];
  const last = index === pages.length - 1;

  const finish = () => {
    track('onboarding_completed', { skipped: !last });
    complete();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.md, height: 44, justifyContent: 'center' }}>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={8}>
            <TText variant="body" color="textSecondary">
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
        keyExtractor={(p) => p.icon}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: pageHeight || undefined, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.md }}>
            <View style={{ width: 96, height: 96, borderRadius: radius.lg, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
              <TIcon name={item.icon} size={44} color={colors.brand} strokeWidth={1.5} />
            </View>
            <TText variant="headline" align="center">
              {item.title}
            </TText>
            <TText variant="bodyLarge" color="textSecondary" align="center">
              {item.body}
            </TText>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.xl }}>
        {pages.map((p, i) => (
          <View key={p.icon} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.brand : colors.border }} />
        ))}
      </View>
      <View style={{ paddingHorizontal: spacing.md }}>
        <TButton
          testID="onboarding-next"
          label={last ? t('onboarding.start') : t('onboarding.next')}
          block
          onPress={() => {
            if (last) return finish();
            list.current?.scrollToIndex({ index: index + 1 });
            setIndex(index + 1);
          }}
        />
      </View>
    </View>
  );
}
