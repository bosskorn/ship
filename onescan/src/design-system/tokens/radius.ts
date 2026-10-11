export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  /** Only for genuinely circular elements (avatars, dots, shutter). */
  round: 999,
} as const;

export type RadiusToken = keyof typeof radius;
