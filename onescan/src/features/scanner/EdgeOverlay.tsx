import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import type { Point } from '@/core/document-engine/model';
import { scan } from './scannerStyle';

const ARM = 22;
const STROKE = 4;
/** Corner guide when no page is found: a centred A4-ish frame, corners only (mockup A). */
function guideCorners(w: number, h: number): Point[] {
  const gw = w * 0.74;
  const gh = Math.min(h * 0.7, gw * 1.414);
  const x0 = (w - gw) / 2;
  const y0 = (h - gh) / 2;
  return [
    { x: x0, y: y0 },
    { x: x0 + gw, y: y0 },
    { x: x0 + gw, y: y0 + gh },
    { x: x0, y: y0 + gh },
  ];
}

// Each corner is an L drawn with two borders, rotated per position (TL, TR, BR, BL).
const cornerBorders = [
  { borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 6 },
  { borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 6 },
  { borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 6 },
  { borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 6 },
];
const cornerOffset = [
  { x: 0, y: 0 },
  { x: -ARM, y: 0 },
  { x: -ARM, y: -ARM },
  { x: 0, y: -ARM },
];

/**
 * Live edge overlay (mockup A–C). All motion runs on the native driver, so the camera and
 * JS thread never wait on it:
 * - no page: four faint corner hints, no full rectangle;
 * - page found: corners spring to the page corners, a soft blue fill and outline join them;
 * - ready: a scan line sweeps the page once (design V2: blue throughout, no green).
 */
export function EdgeOverlay({ points, ready, width, height }: { points: Point[] | null; ready: boolean; width: number; height: number }) {
  const [corners] = useState(() => [0, 1, 2, 3].map(() => new Animated.ValueXY({ x: 0, y: 0 })));
  const [opacity] = useState(() => new Animated.Value(0.55));
  const [sweep] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const target = points ?? (width && height ? guideCorners(width, height) : null);
  const key = target ? target.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ') : '';

  useEffect(() => {
    if (!target) return;
    const anims = corners.map((c, i) => {
      const to = { x: target[i].x + cornerOffset[i].x, y: target[i].y + cornerOffset[i].y };
      return Animated.spring(c, { toValue: to, useNativeDriver: true, stiffness: 420, damping: 32, mass: 1 });
    });
    if (!placed.current) {
      // First layout: jump, don't fly in from the origin.
      corners.forEach((c, i) => c.setValue({ x: target[i].x + cornerOffset[i].x, y: target[i].y + cornerOffset[i].y }));
      placed.current = true;
    } else Animated.parallel(anims).start();
    Animated.timing(opacity, { toValue: points ? 1 : 0.55, duration: 160, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the rounded corner positions
  }, [key, Boolean(points)]);

  useEffect(() => {
    if (!ready) return;
    sweep.setValue(0);
    Animated.timing(sweep, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [ready, sweep]);

  const color = points ? scan.ready : scan.text;
  const top = points ? Math.min(...points.map((p) => p.y)) : 0;
  const bottom = points ? Math.max(...points.map((p) => p.y)) : 0;
  const left = points ? Math.min(...points.map((p) => p.x)) : 0;
  const right = points ? Math.max(...points.map((p) => p.x)) : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {points ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Polygon
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={scan.found}
            fillOpacity={0.13}
            stroke={scan.found}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      {corners.map((c, i) => (
        <Animated.View
          key={i}
          style={[
            styles.corner,
            cornerBorders[i],
            { borderColor: color, opacity, transform: [{ translateX: c.x }, { translateY: c.y }] },
          ]}
        />
      ))}
      {ready && points ? (
        <Animated.View
          style={{
            position: 'absolute',
            left,
            top,
            width: right - left,
            opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, bottom - top)] }) }],
          }}
        >
          <Svg width={Math.max(1, right - left)} height={12}>
            <Line x1={4} y1={6} x2={right - left - 4} y2={6} stroke={scan.brandLight} strokeOpacity={0.35} strokeWidth={10} strokeLinecap="round" />
            <Line x1={4} y1={6} x2={right - left - 4} y2={6} stroke={scan.brandText} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', left: 0, top: 0, width: ARM, height: ARM },
});
