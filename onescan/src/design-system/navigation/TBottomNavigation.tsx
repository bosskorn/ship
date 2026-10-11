import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

export interface TBottomNavItem {
  key: string;
  label: string;
  icon: IconName;
  /** Primary action: brand-filled glyph, still in-line with the bar (not a floating bubble). */
  primary?: boolean;
  badge?: boolean;
}

export interface TBottomNavigationProps {
  items: TBottomNavItem[];
  activeKey: string;
  onPress: (key: string) => void;
  bottomInset: number;
}

export function TBottomNavigation({ items, activeKey, onPress, bottomInset }: TBottomNavigationProps) {
  const { colors, layout, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bgContainer,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
        paddingBottom: bottomInset,
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        const tint = active || item.primary ? colors.brand : colors.textSecondary;
        return (
          <Pressable
            key={item.key}
            testID={`tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onPress(item.key)}
            style={{ flex: 1, height: layout.bottomNavHeight, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            {/* Fixed-height icon slot keeps all labels on one baseline. */}
            <View style={{ height: 30, alignItems: 'center', justifyContent: 'center' }}>
            {item.primary ? (
              <View
                style={{
                  width: 44,
                  height: 30,
                  borderRadius: radius.md,
                  backgroundColor: colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TIcon name={item.icon} size="md" color={colors.textAnti} />
              </View>
            ) : (
              <View>
                <TIcon name={item.icon} size="lg" color={tint} />
                {item.badge ? (
                  <View style={[styles.dot, { backgroundColor: colors.error, borderColor: colors.bgContainer }]} />
                ) : null}
              </View>
            )}
            </View>
            <TText variant="caption" weight={active || item.primary ? '600' : '400'} style={{ color: tint }}>
              {item.label}
            </TText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -1, right: -3, width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
});
