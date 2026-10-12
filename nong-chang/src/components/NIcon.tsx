/**
 * Functional icon set (spec §11). Outline, 24px grid, 1.75 stroke — the same
 * construction as TDesign icons. Decorative icons are intentionally absent.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color as c } from '@/theme/tokens';

export type IconName =
  | 'back'
  | 'chevron-right'
  | 'chevron-down'
  | 'search'
  | 'location'
  | 'chat'
  | 'phone'
  | 'camera'
  | 'image'
  | 'navigation'
  | 'bell'
  | 'close'
  | 'more'
  | 'check'
  | 'star'
  | 'star-filled'
  | 'home'
  | 'jobs'
  | 'user'
  | 'plus'
  | 'minus'
  | 'shield'
  | 'clock'
  | 'verified'
  | 'wifi-off'
  | 'help'
  | 'home-filled'
  | 'jobs-filled'
  | 'chat-filled'
  | 'user-filled'
  | 'ticket'
  | 'receipt'
  | 'card'
  | 'settings'
  | 'file'
  | 'bolt'
  | 'edit';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function NIcon({ name, size = 24, color = c.textPrimary, strokeWidth = 1.75 }: Props) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const body = (() => {
    switch (name) {
      case 'back':
        return <Path d="M15 5l-7 7 7 7" {...p} />;
      case 'chevron-right':
        return <Path d="M9 5l7 7-7 7" {...p} />;
      case 'chevron-down':
        return <Path d="M5 9l7 7 7-7" {...p} />;
      case 'search':
        return (
          <>
            <Circle cx={11} cy={11} r={6.5} {...p} />
            <Path d="M16 16l4.5 4.5" {...p} />
          </>
        );
      case 'location':
        return (
          <>
            <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" {...p} />
            <Circle cx={12} cy={9.5} r={2.5} {...p} />
          </>
        );
      case 'chat':
        return <Path d="M4 5h16v11H9l-5 4V5z" {...p} />;
      case 'phone':
        return <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" {...p} />;
      case 'camera':
        return (
          <>
            <Path d="M3 8h4l2-3h6l2 3h4v11H3V8z" {...p} />
            <Circle cx={12} cy={13} r={3.5} {...p} />
          </>
        );
      case 'image':
        return (
          <>
            <Rect x={3.5} y={4.5} width={17} height={15} rx={1.5} {...p} />
            <Circle cx={9} cy={10} r={1.5} {...p} />
            <Path d="M4 17l5-4 4 3 3-2 4 3" {...p} />
          </>
        );
      case 'navigation':
        return <Path d="M4 11l16-7-7 16-2-7-7-2z" {...p} />;
      case 'bell':
        return (
          <>
            <Path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" {...p} />
            <Path d="M10 20.5h4" {...p} />
          </>
        );
      case 'close':
        return <Path d="M6 6l12 12M18 6L6 18" {...p} />;
      case 'more':
        return (
          <>
            <Circle cx={6} cy={12} r={1.2} fill={color} />
            <Circle cx={12} cy={12} r={1.2} fill={color} />
            <Circle cx={18} cy={12} r={1.2} fill={color} />
          </>
        );
      case 'check':
        return <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
      case 'star':
        return <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5z" {...p} />;
      case 'star-filled':
        return <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />;
      case 'home':
        return <Path d="M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4v-9.5z" {...p} />;
      case 'jobs':
        return (
          <>
            <Rect x={4.5} y={4} width={15} height={17} rx={1.5} {...p} />
            <Path d="M8.5 9h7M8.5 13h7M8.5 17h4" {...p} />
          </>
        );
      case 'user':
        return (
          <>
            <Circle cx={12} cy={8.5} r={4} {...p} />
            <Path d="M4.5 20.5a7.5 7.5 0 0115 0" {...p} />
          </>
        );
      case 'plus':
        return <Path d="M12 5v14M5 12h14" {...p} />;
      case 'minus':
        return <Path d="M5 12h14" {...p} />;
      case 'shield':
        return (
          <>
            <Path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-2.5z" {...p} />
            <Path d="M9 12l2 2 4-4" {...p} />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle cx={12} cy={12} r={8.5} {...p} />
            <Path d="M12 7.5V12l3 2" {...p} />
          </>
        );
      case 'verified':
        return (
          <>
            <Path d="M12 2.8l2.3 1.7 2.8-.2.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.8-.2L12 21.2l-2.3-1.7-2.8.2-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.8.2L12 2.8z" fill={color} />
            <Path d="M8.5 12l2.4 2.4 4.6-4.8" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </>
        );
      case 'wifi-off':
        return (
          <>
            <Path d="M3 3l18 18" {...p} />
            <Path d="M8.5 16a5 5 0 017 0M5 12.5a10 10 0 015.5-2.6M19 12.5a10 10 0 00-3-2" {...p} />
            <Circle cx={12} cy={19.5} r={1} fill={color} />
          </>
        );
      case 'help':
        return (
          <>
            <Circle cx={12} cy={12} r={8.5} {...p} />
            <Path d="M9.8 9.5a2.3 2.3 0 114 1.6c-.9.6-1.8 1.1-1.8 2.4" {...p} />
            <Circle cx={12} cy={16.8} r={1} fill={color} />
          </>
        );
      case 'home-filled':
        return <Path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4v-9.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />;
      case 'jobs-filled':
        return (
          <>
            <Rect x={4.5} y={4} width={15} height={17} rx={2} fill={color} stroke={color} strokeWidth={1.5} />
            <Path d="M8.5 9h7M8.5 13h7M8.5 17h4" stroke="#fff" strokeWidth={1.75} strokeLinecap="round" />
          </>
        );
      case 'chat-filled':
        return <Path d="M4 5h16v11H9l-5 4V5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />;
      case 'user-filled':
        return (
          <>
            <Circle cx={12} cy={8.5} r={4.25} fill={color} />
            <Path d="M4.5 20.5a7.5 7.5 0 0115 0z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          </>
        );
      case 'ticket':
        return <Path d="M3.5 7.5h17v3a1.75 1.75 0 000 3.5v3h-17v-3a1.75 1.75 0 000-3.5v-3zM14 7.5v10" {...p} />;
      case 'receipt':
        return <Path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17zM9 8.5h6M9 12h6M9 15.5h3.5" {...p} />;
      case 'card':
        return (
          <>
            <Rect x={3} y={5.5} width={18} height={13} rx={2} {...p} />
            <Path d="M3 10h18M7 14.5h3" {...p} />
          </>
        );
      case 'settings':
        return (
          <>
            <Circle cx={12} cy={12} r={3} {...p} />
            <Path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} />
          </>
        );
      case 'file':
        return <Path d="M6 3.5h8l4 4v13H6v-17zM14 3.5v4h4M9 12.5h6M9 16h6" {...p} />;
      case 'bolt':
        return <Path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12L13 3z" {...p} />;
      case 'edit':
        return <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" {...p} />;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
