import React, { createContext, useContext, useMemo } from 'react';
import { ColorTokens, darkColors, lightColors } from '../tokens/colors';
import { layout, spacing } from '../tokens/spacing';
import { radius } from '../tokens/radius';
import { elevation } from '../tokens/elevation';
import { motion } from '../tokens/motion';
import { fontFamilies, scriptForLanguage, typeScale } from '../typography/typography';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  typeScale: typeof typeScale;
  fontFamily: string | undefined;
}

export function createTheme(scheme: ColorScheme, language = 'en'): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    layout,
    radius,
    elevation,
    motion,
    typeScale,
    fontFamily: fontFamilies[scriptForLanguage(language)],
  };
}

const ThemeContext = createContext<Theme>(createTheme('light'));

export function ThemeProvider({
  scheme,
  language,
  children,
}: {
  scheme: ColorScheme;
  language: string;
  children: React.ReactNode;
}) {
  const theme = useMemo(() => createTheme(scheme, language), [scheme, language]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Memoised StyleSheet factory bound to the active theme. */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
