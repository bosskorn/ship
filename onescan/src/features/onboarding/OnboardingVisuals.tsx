import React from 'react';
import Svg, { G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/design-system';

/**
 * Onboarding illustrations (design V2): one visual language across the three screens —
 * real-looking paper, the blue corner marks of a found page, a short arrow for "becomes".
 * Drawn with vectors so they stay sharp at any size and follow light/dark themes.
 */

type Kind = 'contract' | 'clean' | 'bill';

function useInk() {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  return {
    paper: dark ? '#F4F3EF' : '#FFFFFF',
    line: '#C7CEDA',
    head: dark ? '#3B66D4' : '#2F5FD0',
    ink: '#24324D',
    desk: dark ? '#2A2724' : '#3B3631',
    stage: colors.bgSecondary,
    brand: colors.brand,
    tint: colors.brandLight,
    border: colors.border,
    mute: colors.textPlaceholder,
    text: colors.textPrimary,
    bg: colors.bgContainer,
  };
}

function Lines({ x, y, w, n, gap, widths, color }: { x: number; y: number; w: number; n: number; gap: number; widths: number[]; color: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Rect key={i} x={x} y={y + i * gap} width={w * widths[i % widths.length]} height={3.2} rx={1.6} fill={color} />
      ))}
    </>
  );
}

/** A drawn page (120 × 160 units) placed at x, y with scale s. */
function Page({ kind, x, y, s = 1, ink }: { kind: Kind; x: number; y: number; s?: number; ink: ReturnType<typeof useInk> }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {/* Soft contact shadow, then the sheet. */}
      <Rect x={2} y={5} width={120} height={160} rx={3} fill="#0F1521" opacity={0.1} />
      <Rect width={120} height={160} rx={3} fill={ink.paper} />
      {kind === 'bill' ? (
        <>
          <Rect x={12} y={12} width={20} height={20} rx={4} fill="#E0A100" />
          <Rect x={38} y={15} width={44} height={5} rx={2} fill={ink.ink} />
          <Rect x={12} y={44} width={96} height={58} rx={3} fill="none" stroke={ink.line} />
          {[0, 1, 2, 3].map((i) => (
            <G key={i}>
              <Rect x={18} y={52 + i * 12} width={44} height={3.2} rx={1.6} fill={ink.line} />
              <Rect x={82} y={52 + i * 12} width={20} height={3.2} rx={1.6} fill={ink.line} />
            </G>
          ))}
          <Rect x={60} y={112} width={48} height={12} rx={3} fill={ink.head} opacity={0.9} />
          <Lines x={12} y={134} w={80} n={2} gap={8} widths={[1, 0.7]} color={ink.line} />
        </>
      ) : (
        <>
          <Rect x={34} y={14} width={52} height={7} rx={2} fill={ink.head} />
          <Lines x={14} y={32} w={92} n={kind === 'clean' ? 14 : 9} gap={8} widths={[1, 0.94, 0.97, 0.7, 0.88]} color={ink.line} />
          {kind === 'contract' ? <Path d="M70 148c4-6 8 4 12-2s6 3 10-1" stroke="#2D3A55" strokeWidth={1.6} fill="none" /> : null}
        </>
      )}
    </G>
  );
}

/** Corner marks of a found page around the rectangle x, y, w, h. */
function Marks({ x, y, w, h, len = 18, sw = 5, color }: { x: number; y: number; w: number; h: number; len?: number; sw?: number; color: string }) {
  const c: [number, number, number, number][] = [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]];
  return (
    <>
      {c.map(([cx, cy, dx, dy], i) => (
        <Path key={i} d={`M${cx + dx * len} ${cy}H${cx}V${cy + dy * len}`} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </>
  );
}

function Arrow({ x, y, down, color }: { x: number; y: number; down?: boolean; color: string }) {
  const d = down ? `M${x} ${y}v22m-8-8 8 8 8-8` : `M${x} ${y}h26m-8-8 8 8-8 8`;
  return <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

function Pill({ x, y, w, label, fill, color }: { x: number; y: number; w: number; label: string; fill: string; color: string }) {
  return (
    <G>
      <Rect x={x} y={y} width={w} height={30} rx={15} fill={fill} />
      <SvgText x={x + w / 2} y={y + 19.5} textAnchor="middle" fontSize={12.5} fontWeight="600" fill={color}>
        {label}
      </SvgText>
    </G>
  );
}

/** 1 — Paper on a desk, found → a clean page as PDF. */
export function ScanVisual() {
  const ink = useInk();
  const quad = '40,66 148,54 159,208 51,220';
  const corners: [number, number, number, number, number, number][] = [
    [40, 66, 148, 54, 51, 220], [148, 54, 40, 66, 159, 208], [159, 208, 148, 54, 51, 220], [51, 220, 40, 66, 159, 208],
  ];
  return (
    <Svg viewBox="0 0 360 300" width="100%" height="100%">
      <Rect x={12} y={34} width={168} height={232} rx={20} fill={ink.desk} />
      <G transform="matrix(.9 -.1 .07 .96 40 66)">
        <Rect width={120} height={160} fill="#F3F1EC" />
        <Page kind="contract" x={0} y={0} ink={{ ...ink, paper: '#F3F1EC' }} />
      </G>
      <Polygon points={quad} fill="rgba(91,147,255,0.14)" stroke="#5B93FF" strokeWidth={2} strokeLinejoin="round" />
      {corners.map(([px, py, ax, ay, bx, by], i) => (
        <Path key={i} d={`M${px + (ax - px) * 0.18} ${py + (ay - py) * 0.18}L${px} ${py}L${px + (bx - px) * 0.12} ${py + (by - py) * 0.12}`} stroke="#7FA9FF" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <Arrow x={192} y={150} color={ink.mute} />
      <Page kind="clean" x={236} y={56} s={0.9} ink={ink} />
      <Marks x={226} y={46} w={128} h={164} color={ink.brand} />
      <Pill x={248} y={222} w={84} label="PDF" fill={ink.tint} color={ink.brand} />
    </Svg>
  );
}

/** 2 — Search finds the words in a scan → share it as PDF. */
export function FindVisual({ query }: { query: string }) {
  const ink = useInk();
  return (
    <Svg viewBox="0 0 360 300" width="100%" height="100%">
      <Page kind="bill" x={24} y={50} s={1.15} ink={ink} />
      <Rect x={34} y={104} width={118} height={20} rx={4} fill={ink.brand} opacity={0.2} />
      <Rect x={34} y={104} width={118} height={20} rx={4} fill="none" stroke={ink.brand} strokeWidth={2} />
      <G transform="translate(70 18)">
        <Rect width={168} height={40} rx={20} fill={ink.bg} stroke={ink.border} />
        <G transform="translate(13 9)">
          <Path d="M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM19 19l-4-4" stroke={ink.mute} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </G>
        <SvgText x={42} y={26} fontSize={15} fill={ink.text}>
          {query}
        </SvgText>
      </G>
      <Arrow x={176} y={150} color={ink.mute} />
      <Page kind="bill" x={226} y={66} s={0.9} ink={ink} />
      <Marks x={216} y={56} w={128} h={164} color={ink.brand} />
      <Pill x={232} y={222} w={96} label="PDF" fill={ink.brand} color="#FFFFFF" />
    </Svg>
  );
}

/** 3 — Your document goes into the phone and stays there. */
export function PrivateVisual({ label }: { label: string }) {
  const ink = useInk();
  return (
    <Svg viewBox="0 0 360 300" width="100%" height="100%">
      <Page kind="contract" x={146} y={14} s={0.566} ink={ink} />
      <Marks x={138} y={6} w={84} h={106} len={12} sw={4} color={ink.brand} />
      <Arrow x={180} y={120} down color={ink.mute} />
      <Rect x={120} y={152} width={120} height={140} rx={22} fill={ink.bg} stroke={ink.text} strokeWidth={3.5} />
      <Rect x={164} y={160} width={32} height={5} rx={2.5} fill={ink.text} />
      <Page kind="contract" x={150} y={176} s={0.5} ink={ink} />
      <Marks x={144} y={170} w={72} h={92} len={11} sw={4} color={ink.brand} />
      <Path d="M244 211h-6" stroke={ink.brand} strokeWidth={2} strokeLinecap="round" />
      <Pill x={250} y={196} w={100} label={label} fill={ink.tint} color={ink.brand} />
    </Svg>
  );
}
