import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, PixelRatio, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TIconButton, TText, useTheme } from '@/design-system';
import type { PageRecord } from '@/core/document-engine/model';

const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 280;
/** Above this the bitmap would risk Android's canvas size limit; render a bit smaller. */
const MAX_RENDER_PIXELS = 20e6;

const dist = (t: { pageX: number; pageY: number }[]) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
const mid = (t: { pageX: number; pageY: number }[]) => ({ x: (t[0].pageX + t[1].pageX) / 2, y: (t[0].pageY + t[1].pageY) / 2 });

/**
 * Full-screen page viewer with pinch / double-tap zoom. The master (full-resolution)
 * image is laid out at its native pixel size and scaled down to fit, so zooming in shows
 * real pixels instead of an upscaled screen-sized bitmap. The preview shows until the
 * master has loaded.
 */
export function PageZoomView({ page, onClose }: { page: PageRecord | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [masterLoaded, setMasterLoaded] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(1);

  // Native-size layout (dp), capped by MAX_RENDER_PIXELS.
  const layout = useMemo(() => {
    if (!page) return { width: 1, height: 1 };
    const px = page.width * page.height;
    const shrink = px > MAX_RENDER_PIXELS ? Math.sqrt(MAX_RENDER_PIXELS / px) : 1;
    const density = PixelRatio.get();
    return { width: (page.width * shrink) / density, height: (page.height * shrink) / density };
  }, [page]);
  const fit = box.width && box.height ? Math.min(box.width / layout.width, box.height / layout.height) : 1;

  const [zoom] = useState(() => new Animated.Value(1));
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [scale] = useState(() => new Animated.Value(1));
  // Geometry for the gesture handlers (they run outside render).
  const geo = useRef({ box, layout, fit });
  useEffect(() => {
    geo.current = { box, layout, fit };
    scale.setValue(fit);
  }, [box, layout, fit, scale]);
  const gesture = useRef({ zoom: 1, x: 0, y: 0, startZoom: 1, startX: 0, startY: 0, startDist: 0, startMid: { x: 0, y: 0 }, lastTap: 0 });

  const responder = useMemo(() => {
    const clamp = (z: number, x: number, y: number) => {
      const g = geo.current;
      const maxX = Math.max(0, (g.layout.width * g.fit * z - g.box.width) / 2);
      const maxY = Math.max(0, (g.layout.height * g.fit * z - g.box.height) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    };
    const apply = (z: number, x: number, y: number, animate = false) => {
      const s = gesture.current;
      const c = clamp(z, x, y);
      s.zoom = z;
      s.x = c.x;
      s.y = c.y;
      setZoomLabel(Math.round(z * 10) / 10);
      if (animate) {
        Animated.parallel([
          Animated.timing(zoom, { toValue: z, duration: 180, useNativeDriver: true }),
          Animated.timing(pan, { toValue: c, duration: 180, useNativeDriver: true }),
        ]).start();
      } else {
        zoom.setValue(z);
        pan.setValue(c);
      }
    };
    // The compiler can't see that PanResponder only calls these on touch events (never
    // during render), where reading refs and the clock is fine.
    /* eslint-disable react-hooks/refs, react-hooks/purity */
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const s = gesture.current;
        const touches = e.nativeEvent.touches;
        s.startZoom = s.zoom;
        s.startX = s.x;
        s.startY = s.y;
        if (touches.length >= 2) {
          s.startDist = dist(touches);
          s.startMid = mid(touches);
        }
      },
      onPanResponderMove: (e, g) => {
        const s = gesture.current;
        const { box: b } = geo.current;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          if (!s.startDist) {
            s.startDist = dist(touches);
            s.startMid = mid(touches);
            s.startZoom = s.zoom;
            s.startX = s.x;
            s.startY = s.y;
          }
          const z = Math.min(MAX_ZOOM, Math.max(1, (s.startZoom * dist(touches)) / s.startDist));
          const m = mid(touches);
          // Keep the point under the fingers fixed while zooming (centre-origin coordinates).
          const cx = s.startMid.x - b.width / 2;
          const cy = s.startMid.y - b.height / 2;
          const k = z / s.startZoom;
          apply(z, cx - (cx - s.startX) * k + (m.x - s.startMid.x), cy - (cy - s.startY) * k + (m.y - s.startMid.y));
        } else if (s.zoom > 1 && !s.startDist) {
          apply(s.zoom, s.startX + g.dx, s.startY + g.dy);
        }
      },
      onPanResponderRelease: (e, g) => {
        const s = gesture.current;
        const { box: b } = geo.current;
        const wasPinch = s.startDist > 0;
        s.startDist = 0;
        if (wasPinch || Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) return;
        const now = Date.now();
        if (now - s.lastTap < DOUBLE_TAP_MS) {
          s.lastTap = 0;
          if (s.zoom > 1) apply(1, 0, 0, true);
          else {
            const cx = e.nativeEvent.pageX - b.width / 2;
            const cy = e.nativeEvent.pageY - b.height / 2;
            apply(DOUBLE_TAP_ZOOM, -cx * (DOUBLE_TAP_ZOOM - 1), -cy * (DOUBLE_TAP_ZOOM - 1), true);
          }
        } else s.lastTap = now;
      },
    });
    /* eslint-enable react-hooks/refs, react-hooks/purity */
  }, [zoom, pan]);

  const reset = () => {
    gesture.current = { ...gesture.current, zoom: 1, x: 0, y: 0, startDist: 0 };
    zoom.setValue(1);
    pan.setValue({ x: 0, y: 0 });
    setZoomLabel(1);
    setMasterLoaded(false);
  };

  const imageStyle = {
    position: 'absolute' as const,
    width: layout.width,
    height: layout.height,
    left: (box.width - layout.width) / 2,
    top: (box.height - layout.height) / 2,
  };
  const transform = [{ translateX: pan.x }, { translateY: pan.y }, { scale: Animated.multiply(zoom, scale) }];

  return (
    <Modal visible={page !== null} animationType="fade" onRequestClose={onClose} onShow={reset} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.mediaBg }}>
        <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox(e.nativeEvent.layout)} {...responder.panHandlers}>
          {page && box.width ? (
            <Animated.View style={[imageStyle, { transform }]} pointerEvents="none">
              {!masterLoaded && page.previewUri ? (
                <Image source={{ uri: page.previewUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              ) : null}
              <Image
                source={{ uri: page.imageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                // Keep the full decode (Android would otherwise downsample to the view).
                resizeMethod="scale"
                onLoad={() => setMasterLoaded(true)}
              />
            </Animated.View>
          ) : null}
        </View>
        <View style={[styles.bar, { top: insets.top + spacing.xs, paddingHorizontal: spacing.xs }]} pointerEvents="box-none">
          <TIconButton icon="close" color={colors.mediaText} accessibilityLabel={t('common.close')} onPress={onClose} />
          <View style={{ backgroundColor: colors.mediaOverlay, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md }}>
            <TText variant="bodySmall" color="mediaText">
              {`${Math.round(zoomLabel * 100)}%`}
            </TText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
