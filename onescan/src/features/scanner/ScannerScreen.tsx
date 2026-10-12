import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TButton, TDialog, TIcon, TIconButton, TText, useTheme, useToast } from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { frameQuadToView } from '@/core/document-engine/capture/quadDetector';
import type { CaptureHint } from '@/core/document-engine/capture/autoCapture';
import type { CaptureMode } from '@/core/document-engine/model';
import { useSettings } from '@/core/config/settingsStore';
import { OneScanCameraView, OneScanCameraViewRef } from '@/native/OneScanCameraView';
import { track } from '@/services/analytics/analytics';
import { useImport } from '@/features/shared/useImport';
import { useScanSession } from './scanSession';
import { ScannerOverlay } from './ScannerOverlay';
import { useLiveDetection } from './useLiveDetection';

const modes: CaptureMode[] = ['document', 'id', 'book', 'whiteboard'];
const hintKey: Record<CaptureHint, 'scanner.hint_searching' | 'scanner.hint_hold_still' | 'scanner.hint_too_dark' | 'scanner.hint_blurry' | 'scanner.hint_capturing'> = {
  searching: 'scanner.hint_searching',
  hold_still: 'scanner.hint_hold_still',
  too_dark: 'scanner.hint_too_dark',
  blurry: 'scanner.hint_blurry',
  ready: 'scanner.hint_capturing',
};

/**
 * Full-screen camera (spec §11–12). Opens straight into Document + Auto.
 * With the native vision module: live border + auto capture when steady.
 * Without it (Expo Go / web): expo-camera with manual capture.
 */
export function ScannerScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const nativeCamera = useRef<OneScanCameraViewRef>(null);
  const expoCamera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const scanner = useSettings((s) => s.scanner);
  const setScanner = useSettings((s) => s.setScanner);
  const { mode, setMode, pages, addPage, replacePage, setRescan, fromEditor, setFromEditor, clear } = useScanSession();
  const { importPhotos } = useImport();
  const busyRef = useRef(false);

  const live = Boolean(OneScanCameraView);
  const autoActive = scanner.autoCapture && live;

  const toEditor = () => {
    if (fromEditor) {
      setFromEditor(false);
      setRescan(null);
      router.back();
    } else router.replace('/editor');
  };

  const close = () => {
    if (fromEditor) return toEditor();
    if (pages.length) return setConfirmDiscard(true);
    clear();
    track('scan_cancelled', {});
    router.back();
  };

  const capture = useCallback(
    async (auto: boolean) => {
      if (!ready || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const photo = live
          ? await nativeCamera.current!.takePhoto()
          : await expoCamera.current!.takePictureAsync({ quality: 0.92, shutterSound: true });
        const page = await DocumentEngine.processCapture(photo.uri);
        track('page_captured', { mode, auto });
        const s = useScanSession.getState();
        if (s.rescanIndex !== null) {
          replacePage(s.rescanIndex, page);
          return toEditor();
        }
        addPage(page);
        if (!useSettings.getState().scanner.multiPage) toEditor();
      } catch {
        toast(t('errors.generic'), 'error');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
    [ready, live, mode],
  );

  const detection = useLiveDetection({ autoCapture: autoActive, paused: busy || !ready, onFire: () => void capture(true) });
  const viewPoints = detection.quad && detection.frame ? frameQuadToView(detection.quad, detection.frame, size) : null;
  const hint = busy
    ? t('scanner.processing')
    : !live
      ? t('scanner.hint_manual')
      : autoActive || detection.quad
        ? t(hintKey[detection.hint])
        : t('scanner.hint_manual');

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.mediaBg }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingHorizontal: spacing.xl }]}>
        <View style={{ alignItems: 'flex-start' }}>
          <TIconButton icon="close" accessibilityLabel={t('scanner.cancel')} onPress={() => router.back()} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm }}>
          <TIcon name="camera" size={48} color={colors.brand} strokeWidth={1.5} />
          <TText variant="titleLarge" align="center">
            {t('scanner.permission_title')}
          </TText>
          <TText variant="body" color="textSecondary" align="center">
            {t('scanner.permission_body')}
          </TText>
          <TButton
            label={permission.canAskAgain ? t('scanner.permission_grant') : t('scanner.permission_settings')}
            block
            style={{ marginTop: spacing.md }}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          />
        </View>
      </View>
    );
  }

  const CameraSurface = OneScanCameraView;

  return (
    <View style={[styles.fill, { backgroundColor: colors.mediaBg }]}>
      {/* Top bar */}
      <View style={[styles.row, { paddingTop: insets.top, paddingHorizontal: spacing.xs, height: insets.top + 52 }]}>
        <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={{ padding: spacing.xs }}>
          <TText variant="bodyLarge" color="mediaText">
            {t('scanner.cancel')}
          </TText>
        </Pressable>
        <View style={[styles.row, { gap: spacing.xxs }]}>
          <TIconButton
            icon={torch ? 'flashOn' : 'flashOff'}
            accessibilityLabel={t('scanner.flash')}
            color={torch ? colors.warning : colors.mediaText}
            onPress={() => setTorch((v) => !v)}
          />
          {live ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: scanner.autoCapture }}
              accessibilityLabel={t('scanner.auto_capture')}
              onPress={() => {
                detection.reset();
                setScanner({ autoCapture: !scanner.autoCapture });
              }}
              style={{ paddingHorizontal: spacing.xs, height: 40, justifyContent: 'center' }}
            >
              <TText variant="body" weight="600" style={{ color: scanner.autoCapture ? colors.brandHover : colors.mediaText }}>
                {scanner.autoCapture ? t('scanner.auto') : t('scanner.manual')}
              </TText>
            </Pressable>
          ) : null}
          <TIconButton
            icon="grid"
            accessibilityLabel={t('scanner.grid')}
            color={scanner.showGrid ? colors.brandHover : colors.mediaText}
            onPress={() => setScanner({ showGrid: !scanner.showGrid })}
          />
        </View>
      </View>

      {/* Camera */}
      <View style={[styles.fill, { overflow: 'hidden' }]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
        {CameraSurface ? (
          <CameraSurface
            ref={nativeCamera}
            style={StyleSheet.absoluteFill}
            torch={torch}
            active
            frameMaxEdge={192}
            frameIntervalMs={250}
            onCameraReady={() => setReady(true)}
            onFrame={detection.onFrame}
            onCameraError={() => toast(t('scanner.unavailable'), 'error')}
          />
        ) : (
          <CameraView
            ref={expoCamera}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            animateShutter
            onCameraReady={() => setReady(true)}
            onMountError={() => toast(t('scanner.unavailable'), 'error')}
          />
        )}
        <ScannerOverlay points={viewPoints} grid={scanner.showGrid} width={size.width} height={size.height} locked={detection.hint === 'ready' || (detection.hint === 'hold_still' && autoActive)} />
        <View style={[styles.hint, { top: spacing.md }]} pointerEvents="none">
          <View style={{ backgroundColor: colors.mediaOverlay, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md }}>
            <TText variant="bodySmall" color="mediaText">
              {hint}
            </TText>
          </View>
        </View>
        {busy ? (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <ActivityIndicator color={colors.mediaText} size="large" />
          </View>
        ) : null}
      </View>

      {/* Mode selector */}
      <View style={[styles.row, { justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm }]} accessibilityRole="tablist">
        {modes.map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: m === mode }} onPress={() => setMode(m)} hitSlop={6}>
            <TText variant="body" weight={m === mode ? '600' : '400'} style={{ color: m === mode ? colors.brandHover : 'rgba(255,255,255,0.7)' }}>
              {t(`scanner.mode_${m}`)}
            </TText>
          </Pressable>
        ))}
      </View>

      {/* Bottom controls */}
      <View style={[styles.row, { paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.md, paddingTop: spacing.xs }]}>
        <View style={{ width: 72, alignItems: 'flex-start' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scanner.gallery')}
            onPress={async () => (await importPhotos({ append: true })) && toEditor()}
            style={styles.sideBtn}
          >
            <TIcon name="gallery" color={colors.mediaText} />
            <TText variant="caption" color="mediaText">
              {t('scanner.gallery')}
            </TText>
          </Pressable>
        </View>
        <Pressable
          testID="shutter"
          accessibilityRole="button"
          accessibilityLabel={t('scanner.shutter')}
          disabled={!ready || busy}
          onPress={() => capture(false)}
          style={({ pressed }) => [styles.shutterOuter, { borderColor: colors.mediaText, opacity: !ready ? 0.5 : 1 }, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <View style={[styles.shutterInner, { backgroundColor: colors.mediaText }]} />
        </Pressable>
        <View style={{ width: 72, alignItems: 'flex-end' }}>
          {pages.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.review', { count: pages.length })} onPress={toEditor}>
              <Image source={{ uri: pages[pages.length - 1].processedUri }} style={{ width: 48, height: 60, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.mediaText }} />
              <View style={[styles.count, { backgroundColor: colors.brand }]}>
                <TText variant="caption" color="textAnti" weight="600">
                  {String(pages.length)}
                </TText>
              </View>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: scanner.multiPage }}
              onPress={() => setScanner({ multiPage: !scanner.multiPage })}
              style={styles.sideBtn}
            >
              <TIcon name="layers" color={scanner.multiPage ? colors.brandHover : colors.mediaText} />
              <TText variant="caption" style={{ color: scanner.multiPage ? colors.brandHover : colors.mediaText }}>
                {scanner.multiPage ? t('scanner.multi_page') : t('scanner.single_page')}
              </TText>
            </Pressable>
          )}
        </View>
      </View>

      <TDialog
        visible={confirmDiscard}
        title={t('editor.discard_title')}
        content={t('editor.discard_body')}
        onRequestClose={() => setConfirmDiscard(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmDiscard(false) },
          {
            label: t('editor.discard'),
            tone: 'danger',
            onPress: () => {
              setConfirmDiscard(false);
              clear();
              router.back();
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sideBtn: { alignItems: 'center', gap: 2, minWidth: 48 },
  shutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  count: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
