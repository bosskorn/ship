import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import { TActionSheet, TButton, TDialog, TIcon, TIconButton, TText, useTheme, useToast } from '@/design-system';
import { defaultFilterFor } from '@/core/document-engine/image/filters';
import type { ScanQuality } from '@/core/document-engine/image/quality';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { frameQuadToView } from '@/core/document-engine/capture/quadDetector';
import { QualityIssue, qualityIssue } from '@/core/document-engine/capture/qualityCoach';
import { newId } from '@/core/document-engine/ids';
import type { CaptureMode, DraftPage, PageFilter } from '@/core/document-engine/model';
import { useFeature } from '@/core/config/remoteConfig';
import { useSettings } from '@/core/config/settingsStore';
import { CameraReadyInfo, CaptureQuality, OneScanCameraView, OneScanCameraViewRef } from '@/native/OneScanCameraView';
import type { CapturedPhoto } from '@/native/OneScanVision';
import { OneScanVision } from '@/native/OneScanVision';
import { track } from '@/services/analytics/analytics';
import { useImport } from '@/features/shared/useImport';
import { CaptureQueue } from './captureQueue';
import { EdgeOverlay } from './EdgeOverlay';
import { chooseEngine } from './engine';
import { noteCropResult } from './cropStats';
import { scanHaptics } from './haptics';
import { CoachTone, QualityCoach } from './QualityCoach';
import { CaptureFlash, ImportButton, ModeSelector, PagesButton, PreparingCard, PrivacyNote, ScannerTopBar, ShutterButton } from './ScannerControls';
import { scan, TOP_BAR } from './scannerStyle';
import { useScanSession } from './scanSession';
import { useLiveDetection } from './useLiveDetection';

type TranslationKey = ParseKeys;

/** Most pages one system-scanner session may return. */
const MAX_SYSTEM_PAGES = 50;

const hasSystemScanner = () => typeof OneScanVision?.scanDocumentsAsync === 'function';

/** Camera actually used: OneScan, the system (Google/VisionKit) scanner, or plain expo-camera when neither exists. */
type ActiveEngine = 'onescan' | 'google' | 'camera';

const coachText: Record<QualityIssue, { key: TranslationKey; sub?: TranslationKey; tone: CoachTone }> = {
  NONE: { key: 'scanner.coach_manual', tone: 'neutral' },
  NO_DOCUMENT: { key: 'scanner.coach_no_document', sub: 'scanner.coach_no_document_sub', tone: 'neutral' },
  INCOMPLETE_EDGE: { key: 'scanner.coach_incomplete_edge', tone: 'warn' },
  TOO_FAR: { key: 'scanner.coach_too_far', tone: 'warn' },
  TOO_CLOSE: { key: 'scanner.coach_too_close', tone: 'warn' },
  LOW_LIGHT: { key: 'scanner.coach_low_light', sub: 'scanner.coach_low_light_sub', tone: 'warn' },
  GLARE: { key: 'scanner.coach_glare', sub: 'scanner.coach_glare_sub', tone: 'warn' },
  SHADOW: { key: 'scanner.coach_shadow', sub: 'scanner.coach_shadow_sub', tone: 'warn' },
  BLUR: { key: 'scanner.coach_blur', sub: 'scanner.coach_blur_sub', tone: 'warn' },
  UNSTABLE: { key: 'scanner.coach_unstable', tone: 'neutral' },
  READY: { key: 'scanner.coach_ready', tone: 'ready' },
};

/** Shutter ring fill per issue: A ≈ empty, B partial, C full. */
const ringFor = (issue: QualityIssue) => (issue === 'READY' ? 1 : issue === 'UNSTABLE' ? 0.66 : issue === 'NO_DOCUMENT' || issue === 'NONE' ? 0.08 : 0.4);

/** Default capture tier: cards always MAX, otherwise the saved-quality setting. */
const tierFor = (mode: CaptureMode, setting: ScanQuality): CaptureQuality => (mode === 'id' || setting === 'maximum' ? 'max' : 'hd');

/** Master tier for a page captured at `q`: MAX keeps every pixel; HD follows the setting (Standard stays Standard). */
const masterTier = (q: CaptureQuality, setting: ScanQuality): ScanQuality => (q === 'max' ? 'maximum' : setting === 'maximum' ? 'high' : setting);

function filterFor(mode: CaptureMode, docType: ReturnType<typeof useScanSession.getState>['docType'], card: boolean): PageFilter {
  if (mode === 'id') return 'card';
  if (mode === 'receipt') return 'auto';
  if (mode === 'auto' && card) return 'card';
  return defaultFilterFor(docType);
}

/**
 * Scanner (Phase 1). The OneScan camera is the main experience: real full-resolution
 * stills (HD/MAX), manual capture first, live edges and a single coaching message, an
 * instant thumbnail per capture while enhancement runs page by page in the background.
 * The system scanner (ML Kit / VisionKit) is the fallback — chosen in Settings, or used
 * automatically when OneScan is turned off, unsupported, or failed to start.
 */
export function ScannerScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const nativeCamera = useRef<OneScanCameraViewRef>(null);
  const expoCamera = useRef<CameraView>(null);

  const customEnabled = useFeature('custom_scanner_enabled');
  const autoCaptureFlag = useFeature('auto_capture_enabled');
  const coachEnabled = useFeature('quality_coach_enabled');
  const scanner = useSettings((s) => s.scanner);
  const setScanner = useSettings((s) => s.setScanner);
  const setHealth = useSettings((s) => s.setScannerHealth);
  const { mode, setMode, pages, multi, setMulti, addPage, replacePage, updatePage, removePage, setRescan, rescanIndex, fromEditor, setFromEditor, clear } =
    useScanSession();
  const { importPhotos } = useImport();

  const [initialChoice] = useState(() => {
    const s = useSettings.getState();
    return chooseEngine(s.scanner.engine, customEnabled, { onescan: OneScanCameraView !== null, google: hasSystemScanner() }, s.scannerHealth);
  });
  /** OneScan can't be used this visit (flag off, unsupported, crashed): never route back to it. */
  const forcedFallback = useRef(initialChoice.fallbackReason !== undefined);
  const [engine, setEngine] = useState<ActiveEngine>(initialChoice.engine ?? 'camera');
  useEffect(() => {
    if (initialChoice.fallbackReason) track('engine_fallback', { reason: initialChoice.fallbackReason });
  }, [initialChoice]);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [quality, setQuality] = useState<CaptureQuality>(() => tierFor(useScanSession.getState().mode, useSettings.getState().scanner.quality));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [flash, setFlash] = useState(0);
  const [preparing, setPreparing] = useState<{ uri: string; aspect: number } | null>(null);
  const [menu, setMenu] = useState(false);
  /** HD↔MAX (or a mode that changes it) may rebind the still camera: hold the shutter until it reports ready. */
  const [switching, setSwitching] = useState(false);
  const cameraInfo = useRef<CameraReadyInfo | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [systemBusy, setSystemBusy] = useState(false);
  const [queue] = useState(() => new CaptureQueue());
  const shutterBusy = useRef(false);
  /** Auto mode: the live page currently looks like a card (read at capture time). */
  const detectionCard = useRef(false);
  const multiTracked = useRef(false);
  const opened = useRef(false);

  const live = engine === 'onescan';
  const autoActive = autoCaptureFlag && scanner.autoCapture && live;
  const single = rescanIndex !== null || !multi;

  useEffect(() => {
    if (opened.current || engine === 'google') return;
    opened.current = true;
    track('scanner_open', { engine, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit, when the camera engine is known
  }, [engine]);

  // Crash guard for Auto fallback: `opening` stays set for the whole camera session, so an
  // app that dies while the OneScan camera is open (crash, ANR kill, force close) is counted
  // on the next visit. A session that closes normally after the camera worked resets it.
  const sessionOk = useRef(false);
  useEffect(() => {
    if (engine !== 'onescan') return;
    const h = useSettings.getState().scannerHealth;
    sessionOk.current = false;
    setHealth({ opening: true, failures: h.failures + (h.opening ? 1 : 0) });
    return () => setHealth(sessionOk.current ? { opening: false, failures: 0 } : { opening: false });
  }, [engine, setHealth]);

  const toEditor = () => {
    if (fromEditor) {
      setFromEditor(false);
      setRescan(null);
      router.back();
    } else router.replace('/editor');
  };

  /** Wait for background processing (showing the page being prepared, never a blank screen), then open the editor. */
  const finish = async () => {
    const s = useScanSession.getState();
    const last = s.pages[s.pages.length - 1];
    if (queue.size && last) setPreparing({ uri: last.processedUri, aspect: last.height / Math.max(1, last.width) });
    await queue.idle();
    setPreparing(null);
    if (!useScanSession.getState().pages.length) return;
    scanHaptics.saved();
    toEditor();
  };

  const close = () => {
    if (fromEditor) return toEditor();
    if (pages.length) return setConfirmDiscard(true);
    clear();
    track('scan_cancelled', {});
    router.back();
  };

  const fallBackToSystem = (reason: 'crashed' | 'unsupported') => {
    track('engine_fallback', { reason });
    forcedFallback.current = true;
    toast(t('scanner.engine_fallback'), 'info');
    setEngine('google');
  };

  // System scanner (fallback engine): its own UI; pages come back cropped and are enhanced here.
  useEffect(() => {
    if (engine !== 'google') return;
    let cancelled = false;
    (async () => {
      const session = useScanSession.getState();
      let scanned: { uri: string }[];
      try {
        scanned = (await OneScanVision!.scanDocumentsAsync(session.rescanIndex !== null ? 1 : MAX_SYSTEM_PAGES, true)).pages;
      } catch {
        if (!cancelled) setEngine(OneScanCameraView ? 'onescan' : 'camera');
        return;
      }
      if (cancelled) return;
      track('scanner_open', { engine: 'google', mode: session.mode });
      if (!scanned.length) {
        // Cancelled: stay in the scan flow on the OneScan camera when it can run.
        if (OneScanCameraView && !forcedFallback.current) return setEngine('onescan');
        if (session.fromEditor) return toEditor();
        clear();
        track('scan_cancelled', {});
        return router.back();
      }
      setSystemBusy(true);
      try {
        for (const p of scanned) {
          const page = await DocumentEngine.processScanned(p.uri, filterFor(session.mode, session.docType, false));
          track('page_captured', { mode: session.mode, auto: true });
          const s = useScanSession.getState();
          if (s.rescanIndex !== null) replacePage(s.rescanIndex, page);
          else addPage(page);
        }
        if (scanned.length > 1) track('multipage_used', { engine: 'google' });
        scanHaptics.saved();
        toEditor();
      } catch {
        toast(t('errors.generic'), 'error');
        setEngine(OneScanCameraView ? 'onescan' : 'camera');
      } finally {
        setSystemBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per switch to the system scanner
  }, [engine]);

  const capture = useCallback(
    async (auto: boolean) => {
      if (!ready || switching || shutterBusy.current || preparing) return;
      const s = useScanSession.getState();
      shutterBusy.current = true;
      scanHaptics.capture();
      setFlash((n) => n + 1);
      let photo: CapturedPhoto;
      try {
        photo = live ? await nativeCamera.current!.takePhoto() : await expoCamera.current!.takePictureAsync({ quality: 1, shutterSound: true });
      } catch {
        track('capture_failed', { stage: 'camera', engine });
        scanHaptics.error();
        toast(t('scanner.capture_failed'), 'error');
        return;
      } finally {
        shutterBusy.current = false;
      }
      const setting = useSettings.getState().scanner.quality;
      const tier = masterTier(quality, setting);
      const filter = filterFor(s.mode, s.docType, detectionCard.current);
      const id = newId();
      // Instant thumbnail: the raw photo (decoded downscaled by the image view) until the enhanced preview replaces it.
      const placeholder: DraftPage = {
        id,
        sourceUri: photo.uri,
        processedUri: photo.uri,
        width: photo.width,
        height: photo.height,
        filter,
        rotation: 0,
        quality: tier,
        processing: true,
      };
      if (s.rescanIndex !== null) replacePage(s.rescanIndex, placeholder);
      else addPage(placeholder);
      track('page_captured', { mode: s.mode, auto });
      track('capture_success', { mode: s.mode, quality, auto, ms: photo.captureMs ?? -1 });
      track(quality === 'max' ? 'max_used' : 'hd_used', { mode: s.mode });
      if (s.mode === 'id' && !useSettings.getState().scanner.cardPrivacySeen) setScanner({ cardPrivacySeen: true });
      if (!multiTracked.current && useScanSession.getState().pages.length === 2 && s.rescanIndex === null) {
        multiTracked.current = true;
        track('multipage_used', { engine });
      }
      void queue.enqueue(async () => {
        try {
          const page = await DocumentEngine.processCapture(photo.uri, filter, {
            prior: s.mode === 'id' ? 'card' : s.mode === 'receipt' ? 'receipt' : null,
            engine: live ? 'onescan' : 'camera',
            tier: quality,
            jpegQuality: photo.quality,
            captureMs: photo.captureMs,
          });
          updatePage(id, { ...page, id, quality: tier, processing: false });
          noteCropResult(page);
        } catch {
          track('capture_failed', { stage: 'processing', engine });
          scanHaptics.error();
          toast(t('scanner.capture_failed'), 'error');
          const at = useScanSession.getState().pages.findIndex((p) => p.id === id);
          if (at >= 0) removePage(at);
        }
      });
      if (s.rescanIndex !== null || !s.multi) void finish();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
    [ready, switching, live, quality, preparing, engine],
  );

  const detection = useLiveDetection({
    autoCapture: autoActive,
    paused: !ready || preparing !== null || !live,
    onFire: () => void capture(true),
    onReady: () => scanHaptics.ready(),
  });
  useEffect(() => {
    detectionCard.current = mode === 'auto' && detection.card;
  }, [mode, detection.card]);

  const switchTier = (next: CaptureQuality) => {
    if (next === quality) return;
    setQuality(next);
    if (live) {
      setSwitching(true);
      // Never strand the shutter if the camera doesn't report back.
      setTimeout(() => setSwitching(false), 1500);
    }
  };

  const changeMode = (m: CaptureMode) => {
    setMode(m);
    detection.reset();
    switchTier(tierFor(m, useSettings.getState().scanner.quality));
  };

  const toggleQuality = () => {
    const next: CaptureQuality = quality === 'max' ? 'hd' : 'max';
    switchTier(next);
    // Outside card mode, the choice sticks for future scans.
    if (mode !== 'id') {
      const cur = useSettings.getState().scanner.quality;
      setScanner({ quality: next === 'max' ? 'maximum' : cur === 'maximum' ? 'high' : cur });
    }
  };

  if (engine === 'google') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: scan.bottom, gap: spacing.sm }]}>
        <ActivityIndicator color={scan.text} size="large" />
        {systemBusy ? (
          <TText variant="body" color="mediaText">
            {t('scanner.preparing')}
          </TText>
        ) : null}
      </View>
    );
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: scan.bottom }} />;

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

  const viewPoints = detection.quad && detection.frame ? frameQuadToView(detection.quad, detection.frame, size) : null;
  const issue: QualityIssue = !live || !coachEnabled ? 'NONE' : qualityIssue({ quad: detection.quad, hint: detection.hint });
  const coach = coachText[issue];
  const coachSub: TranslationKey | undefined = issue === 'READY' ? (autoActive ? 'scanner.coach_ready_auto' : 'scanner.coach_ready_manual') : coach.sub;
  const chip =
    mode === 'id' && quality === 'max' ? t('scanner.card_max') : mode === 'auto' && detection.card && live ? t('scanner.detected_card') : undefined;
  const CameraSurface = OneScanCameraView;
  const showPrivacy = mode === 'id' && !scanner.cardPrivacySeen;

  return (
    <View style={[styles.fill, { backgroundColor: scan.bottom }]}>
      {/* Camera (full bleed under the top bar) */}
      <View style={[styles.fill, { overflow: 'hidden' }]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
        {live && CameraSurface ? (
          <CameraSurface
            ref={nativeCamera}
            style={StyleSheet.absoluteFill}
            torch={torch}
            active
            captureQuality={quality}
            frameMaxEdge={192}
            frameIntervalMs={250}
            onCameraReady={(e) => {
              setReady(true);
              setSwitching(false);
              sessionOk.current = true;
              cameraInfo.current = e.nativeEvent;
            }}
            onFrame={detection.onFrame}
            onCameraError={() => {
              sessionOk.current = false;
              setSwitching(false);
              const h = useSettings.getState().scannerHealth;
              setHealth({ opening: false, failures: h.failures + 1 });
              track('capture_failed', { stage: 'open', engine: 'onescan' });
              if (useSettings.getState().scanner.engine === 'auto' && hasSystemScanner()) fallBackToSystem('crashed');
              else toast(t('scanner.unavailable'), 'error');
            }}
          />
        ) : (
          <CameraView
            ref={expoCamera}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            onCameraReady={() => setReady(true)}
            onMountError={() => toast(t('scanner.unavailable'), 'error')}
          />
        )}
        {scanner.showGrid ? <Grid width={size.width} height={size.height} /> : null}
        {live ? <EdgeOverlay points={viewPoints} ready={issue === 'READY'} width={size.width} height={size.height} /> : null}
        <CaptureFlash trigger={flash} />
        <TierFade visible={switching} />
        {preparing ? null : (
          <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + TOP_BAR + 16 }} pointerEvents="none">
            <QualityCoach tone={coach.tone} message={t(coach.key)} sub={coachSub ? t(coachSub) : undefined} chip={chip} />
          </View>
        )}
        {showPrivacy && !preparing ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 12 }}>
            <PrivacyNote onDismiss={() => setScanner({ cardPrivacySeen: true })} />
          </View>
        ) : null}
        {preparing ? <PreparingCard uri={preparing.uri} aspect={preparing.aspect} /> : null}
        <ScannerTopBar
          insetTop={insets.top}
          torch={torch}
          quality={quality}
          autoCapture={autoCaptureFlag && live ? scanner.autoCapture : null}
          onClose={close}
          onTorch={() => setTorch((v) => !v)}
          onQuality={toggleQuality}
          onAutoCapture={() => {
            detection.reset();
            setScanner({ autoCapture: !scanner.autoCapture });
          }}
          onMore={() => setMenu(true)}
        />
      </View>

      {/* Bottom surface: modes + controls */}
      <View style={{ backgroundColor: scan.bottom, paddingBottom: insets.bottom + 8 }}>
        <ModeSelector mode={mode} onChange={changeMode} disabled={preparing !== null} />
        <View style={styles.controls}>
          <ImportButton
            disabled={preparing !== null}
            onPress={async () => {
              if (await importPhotos({ append: true })) await finish().catch(() => {});
            }}
          />
          <ShutterButton progress={ringFor(issue)} ready={issue === 'READY'} disabled={!ready || switching || preparing !== null} onPress={() => capture(false)} />
          <PagesButton
            pages={rescanIndex === null ? pages : []}
            multi={multi}
            onToggleMulti={() => setMulti(!multi)}
            onDone={() => void finish()}
          />
        </View>
      </View>

      <TActionSheet
        visible={menu}
        cancelLabel={t('common.cancel')}
        items={[
          { key: 'grid', label: t('scanner.grid'), icon: 'grid' },
          ...(hasSystemScanner() && single ? [{ key: 'system', label: t('scanner.open_system_scanner'), icon: 'scan' as const }] : []),
          { key: 'settings', label: t('scanner.scanner_settings'), icon: 'settings' },
        ]}
        onClose={() => setMenu(false)}
        onSelect={(key) => {
          setMenu(false);
          if (key === 'grid') setScanner({ showGrid: !scanner.showGrid });
          else if (key === 'system' && !pages.length) setEngine('google');
          else if (key === 'settings') router.push('/scan-quality');
        }}
      />

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

/** Soft dim while the still camera switches size, so a rebind never looks like a black flash. */
function TierFade({ visible }: { visible: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: visible ? 0.35 : 0, duration: visible ? 120 : 220, useNativeDriver: true }).start();
  }, [visible, v]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: v }]} />;
}

function Grid({ width, height }: { width: number; height: number }) {
  if (!width || !height) return null;
  const xs = [width / 3, (2 * width) / 3];
  const ys = [height / 3, (2 * height) / 3];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {xs.map((x) => (
        <Line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1} />
      ))}
      {ys.map((y) => (
        <Line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, height: 100 },
});
