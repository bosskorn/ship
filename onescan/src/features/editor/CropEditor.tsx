import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Modal, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TButton, TLoading, TText, useTheme } from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { fullFrameQuad } from '@/core/document-engine/capture/CaptureEngine';
import type { DraftPage, Point, Quad } from '@/core/document-engine/model';
import { SecureImage } from '@/features/shared/SecureImage';

const HANDLE = 28;

/** Fit a source of `aspect` (w/h) inside a box, returning the drawn rect. */
function fitRect(aspect: number, box: { width: number; height: number }) {
  const w = Math.min(box.width, box.height * aspect);
  const h = w / aspect;
  return { x: (box.width - w) / 2, y: (box.height - h) / 2, width: w, height: h };
}

/**
 * Manual crop (spec §14): drag the four corners on the original capture.
 * Coordinates are normalised to the upright source image.
 */
export function CropEditor({ page, onCancel, onDone }: { page: DraftPage; onCancel: () => void; onDone: (quad: Quad) => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<{ uri: string; aspect: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [quad, setQuad] = useState<Quad>(page.quad ?? page.crop?.suggestion ?? fullFrameQuad);
  const [detecting, setDetecting] = useState(false);
  const aspect = source?.aspect ?? null;

  useEffect(() => {
    let alive = true;
    DocumentEngine.uprightPreview(page)
      .then((s) => alive && setSource({ uri: s.uri, aspect: s.width / s.height }))
      .catch(() => alive && setSource({ uri: page.sourceUri, aspect: page.width / page.height }));
    return () => {
      alive = false;
    };
  }, [page]);

  const rect = useMemo(() => (aspect && box.width ? fitRect(aspect, box) : null), [aspect, box]);

  // Drag state lives in a ref; handlers below are plain event callbacks.
  const drag = useRef<{ index: number; startX: number; startY: number; from: Point } | null>(null);
  const onGrant = (i: number) => (e: GestureResponderEvent) => {
    drag.current = { index: i, startX: e.nativeEvent.pageX, startY: e.nativeEvent.pageY, from: quad[i] };
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d || !rect) return;
    const next: Point = {
      x: Math.min(1, Math.max(0, d.from.x + (e.nativeEvent.pageX - d.startX) / rect.width)),
      y: Math.min(1, Math.max(0, d.from.y + (e.nativeEvent.pageY - d.startY) / rect.height)),
    };
    setQuad((q) => q.map((p, k) => (k === d.index ? next : p)) as Quad);
  };

  const autoDetect = async () => {
    setDetecting(true);
    try {
      const d = await DocumentEngine.capture.detect(page.sourceUri);
      // The crop editor always shows the best outline, even one not confident enough to auto-apply.
      setQuad(d.suggestion ?? d.quad);
    } finally {
      setDetecting(false);
    }
  };

  const toView = (p: Point) => (rect ? { x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height } : { x: 0, y: 0 });

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.mediaBg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={[styles.row, { paddingHorizontal: spacing.md, height: 52 }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8}>
            <TText variant="bodyLarge" color="mediaText">
              {t('common.cancel')}
            </TText>
          </Pressable>
          <TText variant="title" color="mediaText">
            {t('editor.crop')}
          </TText>
          <Pressable testID="crop-done" accessibilityRole="button" onPress={() => onDone(quad)} hitSlop={8}>
            <TText variant="bodyLarge" weight="600" style={{ color: colors.brandHover }}>
              {t('common.done')}
            </TText>
          </Pressable>
        </View>

        <View style={{ flex: 1, margin: spacing.xl }} onLayout={(e) => setBox(e.nativeEvent.layout)}>
          {!rect ? (
            <TLoading inverse />
          ) : (
            <>
              <SecureImage uri={source!.uri} style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }} resizeMode="stretch" />
              <Svg width={box.width} height={box.height} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Polygon
                  points={quad.map((p) => toView(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(54,110,244,0.15)"
                  stroke={colors.brandHover}
                  strokeWidth={2}
                />
              </Svg>
              {quad.map((p, i) => {
                const v = toView(p);
                return (
                  <View
                    key={i}
                    onStartShouldSetResponder={() => true}
                    onResponderGrant={onGrant(i)}
                    onResponderMove={onMove}
                    onResponderRelease={() => (drag.current = null)}
                    hitSlop={12}
                    accessibilityLabel={`corner-${i}`}
                    style={[styles.handle, { left: v.x - HANDLE / 2, top: v.y - HANDLE / 2, borderColor: colors.brandHover, backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  />
                );
              })}
            </>
          )}
        </View>

        <View style={[styles.row, { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }]}>
          <TButton label={t('scanner.auto')} icon="scan" variant="secondary" size="medium" loading={detecting} onPress={autoDetect} style={{ flex: 1 }} />
          <TButton label={t('editor.crop_full')} icon="crop" variant="outline" size="medium" onPress={() => setQuad(fullFrameQuad)} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, borderWidth: 3 },
});
