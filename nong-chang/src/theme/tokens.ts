/**
 * น้องช่าง design tokens.
 *
 * TDesign is the design source of truth: neutral greys, a single brand hue,
 * clear dividers, small radii and almost no shadow. Screens must never
 * hardcode colors, spacing or radii — always read from here.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Raw palette. Only tokens below should reference these. */
const palette = {
  blue1: '#EAF2FF',
  blue2: '#D2E3FF',
  blue6: '#0B5FFF', // brand primary
  blue7: '#0A4FD6', // hover
  blue8: '#0841AE', // pressed
  cyan5: '#12C2E9', // brand accent
  cyan1: '#E3F8FD',
  green6: '#00A870',
  green1: '#E3F9E9',
  orange6: '#ED7B2F',
  orange1: '#FFF1E9',
  red6: '#D54941',
  red1: '#FFF0ED',
  gray14: '#181818',
  gray12: '#2C2C2C',
  gray9: '#5E5E5E',
  gray7: '#8B8B8B',
  gray6: '#A6A6A6',
  gray4: '#DCDCDC',
  gray3: '#E7E7E7',
  gray2: '#EEEEEE',
  gray1: '#F3F3F3',
  gray0: '#F7F8FA',
  page: '#F2F4F8', // cool off-white page canvas: white containers read clearly on it
  white: '#FFFFFF',
} as const;

export const color = {
  primary: palette.blue6,
  primaryHover: palette.blue7,
  primaryPressed: palette.blue8,
  primaryLight: palette.blue1,
  primaryLightBorder: palette.blue2,
  accent: palette.cyan5,
  accentLight: palette.cyan1,

  success: palette.green6,
  successLight: palette.green1,
  warning: palette.orange6,
  warningLight: palette.orange1,
  error: palette.red6,
  errorLight: palette.red1,

  textPrimary: palette.gray14,
  textSecondary: palette.gray9,
  textPlaceholder: palette.gray6,
  textDisabled: palette.gray6,
  textOnPrimary: palette.white,

  border: palette.gray4,
  divider: palette.gray3,

  bgPage: palette.page,
  bgContainer: palette.white,
  bgElevated: palette.white,
  bgSecondary: palette.gray1,
  bgDisabled: palette.gray2,
  bgMask: 'rgba(0,0,0,0.45)',

  brandSplash: palette.blue6,
  /** Brand gradient — reserved for brand moments (launch, signature graphics). Never on regular buttons. */
  brandGradientFrom: palette.blue6,
  brandGradientTo: palette.cyan5,
  /** Service graphic system palette. */
  graphicTint: '#E8F0FF',
  graphicMid: '#7FA6FF',
  graphicDeep: '#0A3FB0',
  rating: '#F5A623',
} as const;

export type ColorToken = keyof typeof color;

/** 4-based spacing scale. No ad-hoc values. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const layout = {
  screenPadding: space.md,
  sectionGap: space.xl,
  bottomBarHeight: 56,
  appBarHeight: 48,
  minTouch: 44,
} as const;

export const radius = {
  sm: 4, // tags (non-pill), skeleton lines
  button: 6,
  input: 6,
  card: 8,
  dialog: 12,
  sheet: 12, // top corners only
  pill: 999, // tag / status / filter ONLY
} as const;

const fontFamily = Platform.select({
  // iOS: system font (SF + Thonburi fallback). Android: system Thai is Noto Sans Thai.
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

type Weight = '400' | '500' | '600';
const weight: Record<'regular' | 'medium' | 'semibold', Weight> = {
  regular: '400',
  medium: '500',
  semibold: '600',
};

const t = (size: number, lineHeight: number, w: Weight): TextStyle => ({
  fontFamily,
  fontSize: size,
  // Thai has tall ascenders/descenders (สระบน/ล่าง) — keep generous line heights.
  lineHeight,
  fontWeight: w,
});

export const typography = {
  display: t(30, 42, weight.semibold),
  /** Home hero question — the single loudest line on Home. */
  hero: t(26, 38, weight.semibold),
  /** Prominent prices (number part). */
  price: t(22, 30, weight.semibold),
  h1: t(24, 34, weight.semibold),
  h2: t(20, 30, weight.semibold),
  h3: t(18, 28, weight.medium),
  bodyStrong: t(16, 24, weight.medium),
  body: t(16, 24, weight.regular),
  secondary: t(14, 22, weight.regular),
  secondaryStrong: t(14, 22, weight.medium),
  label: t(12, 16, weight.medium),
  caption: t(12, 18, weight.regular),
} as const;

export type TypographyToken = keyof typeof typography;

/** Motion timings in ms (spec §57). */
export const motion = {
  feedback: 80,
  micro: 150,
  sheet: 300,
  success: 650,
  splashHold: 400,
  brandAnimation: 800,
  crossfade: 200,
} as const;

/** Shadows are reserved for bottom sheets, floating controls and elevated dialogs. */
export const elevation: Record<'sheet' | 'floating' | 'dialog', ViewStyle> = {
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dialog: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
};

export const hairline = 1;
