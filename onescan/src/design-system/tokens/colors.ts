import { palette } from './palette';

/** Semantic color tokens. Keys mirror the spec's `/color/*` token names. */
export interface ColorTokens {
  brand: string;
  brandHover: string;
  brandActive: string;
  brandLight: string;
  brandDisabled: string;
  textPrimary: string;
  textSecondary: string;
  textPlaceholder: string;
  textDisabled: string;
  textAnti: string;
  bgPage: string;
  bgContainer: string;
  bgSecondary: string;
  bgPressed: string;
  bgMask: string;
  border: string;
  divider: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  info: string;
  infoLight: string;
  /** Surfaces for camera / full-bleed media screens (always dark). */
  mediaBg: string;
  mediaText: string;
  mediaOverlay: string;
}

export const lightColors: ColorTokens = {
  brand: palette.blue[7],
  brandHover: palette.blue[6],
  brandActive: palette.blue[8],
  brandLight: palette.blue[1],
  brandDisabled: palette.blue[3],
  textPrimary: 'rgba(0,0,0,0.9)',
  textSecondary: 'rgba(0,0,0,0.6)',
  textPlaceholder: 'rgba(0,0,0,0.4)',
  textDisabled: 'rgba(0,0,0,0.26)',
  textAnti: palette.white,
  bgPage: palette.gray[1],
  bgContainer: palette.white,
  bgSecondary: palette.gray[1],
  bgPressed: palette.gray[2],
  bgMask: 'rgba(0,0,0,0.6)',
  border: palette.gray[4],
  divider: palette.gray[3],
  success: palette.green[6],
  successLight: palette.green[1],
  warning: palette.orange[6],
  warningLight: palette.orange[1],
  error: palette.red[6],
  errorLight: palette.red[1],
  info: palette.blue[7],
  infoLight: palette.blue[1],
  mediaBg: palette.black,
  mediaText: palette.white,
  mediaOverlay: 'rgba(0,0,0,0.45)',
};

export const darkColors: ColorTokens = {
  brand: '#4582E6',
  brandHover: '#5E95F0',
  brandActive: '#2C6BD6',
  brandLight: '#1B2F51',
  brandDisabled: '#1C3366',
  textPrimary: 'rgba(255,255,255,0.9)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textPlaceholder: 'rgba(255,255,255,0.35)',
  textDisabled: 'rgba(255,255,255,0.22)',
  textAnti: palette.white,
  bgPage: palette.gray[14],
  bgContainer: palette.gray[13],
  bgSecondary: palette.gray[12],
  bgPressed: palette.gray[11],
  bgMask: 'rgba(0,0,0,0.6)',
  border: palette.gray[10],
  divider: palette.gray[11],
  success: palette.green.dark,
  successLight: '#193A2A',
  warning: palette.orange.dark,
  warningLight: '#4F2A1D',
  error: palette.red.dark,
  errorLight: '#472324',
  info: '#4582E6',
  infoLight: '#1B2F51',
  mediaBg: palette.black,
  mediaText: palette.white,
  mediaOverlay: 'rgba(0,0,0,0.45)',
};
