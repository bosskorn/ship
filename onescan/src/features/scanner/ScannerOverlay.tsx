import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Polygon } from 'react-native-svg';
import { useTheme } from '@/design-system';
import type { Quad } from '@/core/document-engine/model';

/**
 * Draws the detected document border (when native live detection provides a
 * quad) or a neutral framing guide, plus an optional rule-of-thirds grid.
 */
export function ScannerOverlay({ quad, grid, width, height }: { quad: Quad | null; grid: boolean; width: number; height: number }) {
  const { colors } = useTheme();
  if (!width || !height) return null;
  const g = 'rgba(255,255,255,0.35)';
  const inset = 0.08;
  const len = Math.min(width, height) * 0.08;
  const [l, t, r, b] = [width * inset, height * inset, width * (1 - inset), height * (1 - inset)];

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
        {quad ? (
          <Polygon
            points={quad.map((p) => `${p.x * width},${p.y * height}`).join(' ')}
            fill="rgba(0,82,217,0.18)"
            stroke={colors.brand}
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
