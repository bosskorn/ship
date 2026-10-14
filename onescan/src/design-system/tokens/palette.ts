/**
 * Raw palette (TDesign-inspired). Components must NOT import this file —
 * use semantic tokens from `./colors` via `useTheme()` instead.
 */
export const palette = {
  blue: {
    1: '#F2F3FF',
    2: '#D9E1FF',
    3: '#B5C7FF',
    4: '#8EABFF',
    5: '#618DFF',
    6: '#366EF4',
    7: '#0052D9',
    8: '#003CAB',
    9: '#002A7C',
    10: '#001A57',
  },
  gray: {
    1: '#F3F3F3',
    2: '#EEEEEE',
    3: '#E7E7E7',
    4: '#DCDCDC',
    5: '#C5C5C5',
    6: '#A6A6A6',
    7: '#8B8B8B',
    8: '#777777',
    9: '#5E5E5E',
    10: '#4B4B4B',
    11: '#383838',
    12: '#2C2C2C',
    13: '#242424',
    14: '#181818',
  },
  green: { 1: '#E3F9E9', 6: '#2BA471', 7: '#008858', dark: '#059465' },
  orange: { 1: '#FFF1E9', 6: '#E37318', 7: '#BE5A00', dark: '#C35A00' },
  red: { 1: '#FFF0ED', 6: '#D54941', 7: '#AD352F', dark: '#C64751' },
  white: '#FFFFFF',
  black: '#000000',
} as const;
