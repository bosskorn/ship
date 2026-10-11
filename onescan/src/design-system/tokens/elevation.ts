import { Platform, ViewStyle } from 'react-native';

/** Enterprise style: elevation is rare and subtle. Prefer dividers. */
export const elevation: Record<'none' | 'overlay', ViewStyle> = {
  none: {},
  overlay: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 6 },
    default: { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } as ViewStyle,
  })!,
};
