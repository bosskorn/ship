/**
 * Design tokens. TDesign-inspired: neutral greys, one brand blue, colour only for state,
 * 4px grid, small radii, dense but legible type. Not a Lalamove look-alike.
 */
export const color = {
  brand: '#0052D9',
  brandLight: '#ECF2FE',
  brandPressed: '#003CAB',
  success: '#2BA471',
  successLight: '#E3F9E9',
  warning: '#E37318',
  warningLight: '#FFF1E9',
  danger: '#D54941',
  dangerLight: '#FFF0ED',
  text: '#1F2329',
  text2: '#5E6673',
  text3: '#8B929C',
  placeholder: '#B5BAC1',
  border: '#E7E7E7',
  divider: '#F0F1F3',
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 3, md: 6, pill: 999 } as const;

export const font = {
  // System fonts render Thai well on both platforms; no custom font download needed.
  title: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  h2: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  number: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
};

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const TOUCH = 48;

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: color.text2, bg: color.divider },
  brand: { fg: color.brand, bg: color.brandLight },
  success: { fg: color.success, bg: color.successLight },
  warning: { fg: color.warning, bg: color.warningLight },
  danger: { fg: color.danger, bg: color.dangerLight },
};
