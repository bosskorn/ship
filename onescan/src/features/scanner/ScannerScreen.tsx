import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TButton, TDialog, TIcon, TIconButton, TText, useTheme, useToast } from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import type { CaptureMode } from '@/core/document-engine/model';
import { useSettings } from '@/core/config/settingsStore';
import { track } from '@/services/analytics/analytics';
import { useScanSession } from './scanSession';
import { ScannerOverlay } from './ScannerOverlay';
import { useImport } from '@/features/shared/useImport';

const modes: CaptureMode[] = ['document', 'id', 'book', 'whiteboard'];

/**
 * Full-screen camera (spec §11). Opens straight into Document + Auto.
 * No document-type picker before capture; detection happens on device.
 */
export function ScannerScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const scanner = useSettings((s) => s.scanner);
  const setScanner = useSettings((s) => s.setScanner);
  const { mode, setMode, pages, addPage, replacePage, rescanIndex, setRescan, fromEditor, setFromEditor, clear } = useScanSession();
  const { importPhotos } = useImport();

  // Live boundary + auto capture require the native vision camera view.
  const liveDetection = DocumentEngine.capture.hasNativeDetection();
  const autoActive = scanner.autoCapture && liveDetection;
  const hint = busy ? t('scanner.processing') : autoActive ? t('scanner.hint_searching') : t('scanner.hint_manual');

  /** Go to review: pop back to the existing editor, or open one. */
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

  const capture = async () => {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.92, shutterSound: true });
      const page = await DocumentEngine.processCapture(photo.uri);
      track('page_captured', { mode, auto: autoActive });
      if (rescanIndex !== null) {
        replacePage(rescanIndex, page);
        return toEditor();
      }
      addPage(page);
      if (!scanner.multiPage) toEditor();
    } catch {
      toast(t('errors.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

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
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: scanner.autoCapture }}
            accessibilityLabel={t('scanner.auto_capture')}
            onPress={() => setScanner({ autoCapture: !scanner.autoCapture })}
            style={{ paddingHorizontal: spacing.xs, height: 40, justifyContent: 'center' }}
          >
            <TText variant="body" weight="600" style={{ color: scanner.autoCapture ? colors.brandHover : colors.mediaText }}>
              {scanner.autoCapture ? t('scanner.auto') : t('scanner.manual')}
            </TText>
          </Pressable>
          <TIconButton
            icon="grid"
            accessibilityLabel={t('scanner.grid')}
            color={scanner.showGrid ? colors.brandHover : colors.mediaText}
            onPress={() => setScanner({ showGrid: !scanner.showGrid })}
          />
        </View>
      </View>

      {/* Camera */}
      <View style={styles.fill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter
          onCameraReady={() => setReady(true)}
          onMountError={() => toast(t('scanner.unavailable'), 'error')}
        />
        <ScannerOverlay quad={null} grid={scanner.showGrid} width={size.width} height={size.height} />
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
          <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.gallery')} onPress={async () => (await importPhotos({ append: true })) && toEditor()} style={styles.sideBtn}>
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
          onPress={capture}
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
