import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';
import { haptics } from '../haptics';

export interface TBottomNavItem {
  key: string;
  label: string;
  icon: IconName;
  /** The app's primary action (Scan): a raised round button in the bar, not a destination. */
  primary?: boolean;
  badge?: boolean;
}

export interface TBottomNavigationProps {
  items: TBottomNavItem[];
  activeKey: string;
  onPress: (key: string) => void;
  onLongPress?: (key: string) => void;
  bottomInset: number;
}

const BAR = 64;
const ACTION = 56;

/**
 * Android navigation bar: icon + label per destination, a pill indicator behind the active
 * icon, and one raised primary action in the centre (Scan) that is always one tap away.
 */
export function TBottomNavigation({ items, activeKey, onPress, onLongPress, bottomInset }: TBottomNavigationProps) {
  const { colors } = useTheme();
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
        if (item.primary) {
          return (
            <View key={item.key} style={{ flex: 1, height: BAR, alignItems: 'center' }}>
              <Pressable
                testID={`tab-${item.key}`}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => {
                  haptics.tap();
                  onPress(item.key);
                }}
                onLongPress={onLongPress ? () => {
                  haptics.long();
                  onLongPress(item.key);
                } : undefined}
                style={({ pressed }) => ({
                  width: ACTION,
                  height: ACTION,
                  marginTop: -ACTION / 3,
                  borderRadius: ACTION / 2,
                  backgroundColor: pressed ? colors.brandActive : colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: colors.bgContainer,
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOpacity: 0.18,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                })}
              >
                <TIcon name={item.icon} size="lg" color={colors.textAnti} strokeWidth={2} />
              </Pressable>
              <TText variant="bodySmall" weight="600" style={{ color: colors.brand, marginTop: 0, lineHeight: 16 }}>
                {item.label}
              </TText>
            </View>
          );
        }
        return (
          <Pressable
            key={item.key}
            testID={`tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.select();
              onPress(item.key);
            }}
            style={{ flex: 1, height: BAR, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            {/* Active indicator: a pill behind the icon (Material navigation bar). */}
            <View
              style={{
                width: 56,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors.brandLight : 'transparent',
              }}
            >
              <TIcon name={item.icon} size="md" color={active ? colors.brand : colors.textSecondary} strokeWidth={active ? 2 : 1.75} />
              {item.badge ? <View style={[styles.dot, { backgroundColor: colors.error, borderColor: colors.bgContainer }]} /> : null}
            </View>
            <TText variant="bodySmall" weight={active ? '600' : '400'} color={active ? 'textPrimary' : 'textSecondary'} numberOfLines={1} style={{ lineHeight: 16 }}>
              {item.label}
            </TText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: 2, end: 14, width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
});
