import React, { useRef, useState } from 'react';
import { FlatList, Image, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconName, TButton, TIcon, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { useFeature } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';

const logo = require('../../../assets/splash-icon.png');

interface Page {
  key: string;
  /** Visual: the app mark on the first page, one functional icon after that. */
  icon?: IconName;
  title: string;
  body: string;
}

/**
 * First launch: two short pages (what OneScan does, where documents live), then Home.
 * No login (spec §47–48). Same language as Home: left-aligned type, one primary button.
 */
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
  const titleSize = width >= 400 ? { fontSize: 34, lineHeight: 46 } : { fontSize: 28, lineHeight: 40 };

  const pages: Page[] = [
    { key: 'scan', title: t('onboarding.scan_title'), body: t('onboarding.scan_body') },
    { key: 'private', icon: 'shield', title: t('onboarding.private_title'), body: t('onboarding.private_body') },
    // AI page only when AI ships (off in 1.2.0).
    ...(aiEnabled ? [{ key: 'ai', icon: 'ai' as IconName, title: t('onboarding.ai_title'), body: t('onboarding.ai_body') }] : []),
  ];
  const last = index === pages.length - 1;

  const finish = () => {
    track('onboarding_completed', { skipped: !last });
    complete();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.md }}>
        <TText variant="title" weight="700" style={{ flex: 1 }}>
          OneScan
        </TText>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={12}>
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
        keyExtractor={(p) => p.key}
        // Pages are exactly one screen wide: "Next" can scroll before a page is measured.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: pageHeight || undefined, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md }}>
            {item.icon ? (
              <View style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                <TIcon name={item.icon} size={36} color={colors.brand} strokeWidth={1.75} />
              </View>
            ) : (
              <Image testID="onboarding-logo" source={logo} style={{ width: 72, height: 72 }} accessible={false} />
            )}
            <TText variant="headline" weight="700" accessibilityRole="header" style={[titleSize, { letterSpacing: -0.3, marginTop: spacing.xs }]}>
              {item.title}
            </TText>
            <TText variant="bodyLarge" color="textSecondary">
              {item.body}
            </TText>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
        {pages.map((p, i) => (
          <View key={p.key} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.brand : colors.border }} />
        ))}
      </View>
      <View style={{ paddingHorizontal: spacing.md }}>
        <TButton
          testID="onboarding-next"
          label={last ? t('onboarding.start') : t('onboarding.next')}
          block
          style={{ height: 56 }}
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
