/** 4px base grid. */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

/** Layout constants derived from the grid. */
export const layout = {
  pagePaddingH: spacing.md,
  sectionGap: spacing.xl,
  componentGap: spacing.xs,
  cellMinHeight: 56,
  navBarHeight: 48,
  bottomNavHeight: 56,
  hitSlop: 8,
} as const;

export type SpacingToken = keyof typeof spacing;
