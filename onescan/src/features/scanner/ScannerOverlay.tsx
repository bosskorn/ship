import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Polygon } from 'react-native-svg';
import { useTheme } from '@/design-system';
import type { Point } from '@/core/document-engine/model';

/**
 * Draws the live document border (view-space points from the detector) or a
 * neutral framing guide, plus an optional rule-of-thirds grid.
 */
export function ScannerOverlay({ points, grid, width, height, locked }: { points: Point[] | null; grid: boolean; width: number; height: number; locked?: boolean }) {
  const { colors } = useTheme();
  if (!width || !height) return null;
  const g = 'rgba(255,255,255,0.35)';
  const inset = 0.08;
  const len = Math.min(width, height) * 0.08;
  const [l, t, r, b] = [width * inset, height * inset, width * (1 - inset), height * (1 - inset)];
  const stroke = locked ? colors.success : colors.brandHover;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {grid ? (
          <>
            <Line x1={width / 3} y1={0} x2={width / 3} y2={height} stroke={g} strokeWidth={1} />
            <Line x1={(2 * width) / 3} y1={0} x2={(2 * width) / 3} y2={height} stroke={g} strokeWidth={1} />
            <Line x1={0} y1={height / 3} x2={width} y2={height / 3} stroke={g} strokeWidth={1} />
            <Line x1={0} y1={(2 * height) / 3} x2={width} y2={(2 * height) / 3} stroke={g} strokeWidth={1} />
          </>
        ) : null}
        {points ? (
          <Polygon
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={locked ? 'rgba(43,164,113,0.18)' : 'rgba(54,110,244,0.18)'}
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        ) : (
          <Path
            d={[
              `M${l},${t + len} V${t} H${l + len}`,
              `M${r - len},${t} H${r} V${t + len}`,
              `M${r},${b - len} V${b} H${r - len}`,
              `M${l + len},${b} H${l} V${b - len}`,
            ].join(' ')}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </Svg>
    </View>
  );
}
