/**
 * Service graphic family (directive V2 §3, §24).
 *
 * One construction for every category: 64×64 grid, flat geometric shapes with
 * a single "deep" shade for dimension, drawn only from the brand palette
 * (primary / deep / mid / accent / white) on a tinted rounded tile.
 * Not emoji, not clip art, not cartoon.
 */
import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { CategoryId } from '@/data/catalog';
import { color } from '@/theme/tokens';

type GraphicKey = 'aircon' | 'plumbing' | 'electrical' | 'cleaning' | 'appliance' | 'general';

interface Palette {
  tile: string;
  p: string; // primary body
  d: string; // deep shade (dimension)
  m: string; // mid tone
  c: string; // accent
  w: string; // white
}

const BRAND: Palette = { tile: color.graphicTint, p: color.primary, d: color.graphicDeep, m: color.graphicMid, c: color.accent, w: '#FFFFFF' };
const MUTED: Palette = { tile: '#EEF0F3', p: '#B9BFC9', d: '#9AA1AD', m: '#CDD2DA', c: '#D9DDE3', w: '#FFFFFF' };

const sparkle = (x: number, y: number, s: number) => `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;

function Art({ k, c }: { k: GraphicKey; c: Palette }) {
  switch (k) {
    case 'aircon':
      return (
        <>
          <Rect x={8} y={13} width={48} height={22} rx={6} fill={c.p} />
          <Rect x={8} y={13} width={48} height={7} rx={3.5} fill={c.m} opacity={0.55} />
          <Rect x={13} y={28} width={38} height={3} rx={1.5} fill={c.d} />
          <Circle cx={49} cy={21.5} r={1.8} fill={c.c} />
          {[22, 32, 42].map((x) => (
            <Path key={x} d={`M${x} 40q3.2 4 0 8t0 8`} stroke={c.c} strokeWidth={3} strokeLinecap="round" fill="none" />
          ))}
        </>
      );
    case 'plumbing':
      return (
        <>
          <Rect x={9} y={15} width={8} height={18} rx={2.5} fill={c.d} />
          <Rect x={15} y={19} width={28} height={9} rx={4.5} fill={c.p} />
          <Rect x={34} y={19} width={9} height={17} rx={4.5} fill={c.p} />
          <Rect x={26.5} y={13} width={4} height={7} fill={c.m} />
          <Rect x={21} y={9} width={15} height={5} rx={2.5} fill={c.m} />
          <Path d="M38.5 41C38.5 41 33 47.2 33 50.8a5.5 5.5 0 0 0 11 0C44 47.2 38.5 41 38.5 41Z" fill={c.c} />
        </>
      );
    case 'electrical':
      return (
        <>
          <Rect x={24} y={9} width={4.5} height={12} rx={2.25} fill={c.d} />
          <Rect x={35.5} y={9} width={4.5} height={12} rx={2.25} fill={c.d} />
          <Rect x={18} y={19} width={28} height={23} rx={7} fill={c.p} />
          <Path d="M35 23L27.5 32.5H32.5L30 39.5L38 29.5H33Z" fill={c.c} />
          <Path d="M32 42v6.5a4.5 4.5 0 0 0 4.5 4.5H48" stroke={c.m} strokeWidth={4} strokeLinecap="round" fill="none" />
        </>
      );
    case 'cleaning':
      return (
        <>
          <Rect x={20} y={12} width={17} height={7} rx={2.5} fill={c.m} />
          <Rect x={36} y={13.5} width={7} height={4} rx={1.5} fill={c.m} />
          <Rect x={24} y={18} width={9} height={9} rx={2} fill={c.d} />
          <Rect x={17} y={26} width={23} height={29} rx={6} fill={c.p} />
          <Rect x={21.5} y={34} width={14} height={10} rx={2.5} fill={c.w} opacity={0.9} />
          <Path d={sparkle(50, 27, 6)} fill={c.c} />
          <Path d={sparkle(47.5, 41, 3.8)} fill={c.c} />
        </>
      );
    case 'appliance':
      return (
        <>
          <Rect x={14} y={8} width={36} height={48} rx={6} fill={c.p} />
          <Path d="M20 8h24a6 6 0 0 1 6 6v5H14v-5a6 6 0 0 1 6-6Z" fill={c.d} />
          <Circle cx={20.5} cy={13.5} r={2} fill={c.c} />
          <Rect x={35} y={12} width={10} height={3} rx={1.5} fill={c.m} />
          <Circle cx={32} cy={37.5} r={12} fill={c.w} />
          <Circle cx={32} cy={37.5} r={8} fill={c.c} />
          <Path d="M24.5 39q3.75-3 7.5 0t7.5 0" stroke={c.w} strokeWidth={2} strokeLinecap="round" fill="none" />
        </>
      );
    case 'general':
      return (
        <>
          <G rotation={-45} origin="32, 32">
            <Rect x={30.5} y={10} width={3} height={26} rx={1} fill={c.d} />
            <Rect x={27} y={34} width={10} height={20} rx={4} fill={c.p} />
          </G>
          <G rotation={45} origin="32, 32">
            <Rect x={29} y={22} width={6} height={32} rx={3} fill={c.m} />
            <Circle cx={32} cy={18} r={8.5} fill={c.c} />
            <Rect x={29} y={7} width={6} height={10.5} rx={1.5} fill={c.tile} />
          </G>
        </>
      );
  }
}

const KEY_FOR_CATEGORY: Record<CategoryId, GraphicKey> = {
  aircon: 'aircon',
  plumbing: 'plumbing',
  electrical: 'electrical',
  cleaning: 'cleaning',
  appliance: 'appliance',
  install: 'general',
  maintenance: 'general',
  interior: 'general',
  exterior: 'general',
};

export function ServiceGraphic({
  category,
  size = 56,
  tile = true,
  muted,
}: {
  category: CategoryId;
  size?: number;
  /** Draw the tinted rounded tile behind the graphic. */
  tile?: boolean;
  /** Greyed out for categories that are not yet available. */
  muted?: boolean;
}) {
  const c = muted ? MUTED : BRAND;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {tile ? <Rect width={64} height={64} rx={18} fill={c.tile} /> : null}
      <G scale={tile ? 0.82 : 1} origin="32, 32">
        <Art k={KEY_FOR_CATEGORY[category]} c={tile ? c : { ...c, tile: '#FFFFFF' }} />
      </G>
    </Svg>
  );
}
