import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName } from '../icons/TIcon';
import { TIconButton } from '../buttons/TIconButton';

export interface TTopAppBarAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}

/**
 * Android top app bar for top-level screens: title at the start, up to three icon
 * actions at the end. `leading` replaces the title area (e.g. a brand mark or a
 * selection count with a close button).
 */
export function TTopAppBar({ title, leading, actions = [] }: { title?: string; leading?: React.ReactNode; actions?: TTopAppBarAction[] }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingStart: spacing.md, paddingEnd: spacing.xxs, backgroundColor: colors.bgContainer }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {leading ?? (
          <TText variant="titleLarge" weight="700" numberOfLines={1} accessibilityRole="header" style={{ fontSize: 22 }}>
            {title}
          </TText>
        )}
      </View>
      {actions.map((a) => (
        <TIconButton key={a.label} testID={a.testID} icon={a.icon} accessibilityLabel={a.label} onPress={a.onPress} size={48} />
      ))}
    </View>
  );
}
