import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ellipsis, Images, Layers, Lock, Timer, X, Zap, ZapOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/design-system';
import type { CaptureMode, DraftPage } from '@/core/document-engine/model';
import type { CaptureQuality } from '@/native/OneScanCameraView';
import { scan, SHUTTER, TOP_BAR } from './scannerStyle';
import { SecureImage } from '@/features/shared/SecureImage';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Top surface: Close · Flash · HD/MAX · Auto capture · More (locked layout). */
export function ScannerTopBar(props: {
  insetTop: number;
  torch: boolean;
  quality: CaptureQuality;
  autoCapture: boolean | null;
  onClose: () => void;
  onTorch: () => void;
  onQuality: () => void;
  onAutoCapture: () => void;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  const max = props.quality === 'max';
  return (
    <View style={[styles.top, { paddingTop: props.insetTop, height: props.insetTop + TOP_BAR }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.close')} onPress={props.onClose} style={styles.iconBtn} hitSlop={4}>
        <X size={22} color={scan.text} strokeWidth={2} />
      </Pressable>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: props.torch }}
          accessibilityLabel={t('scanner.flash')}
          onPress={props.onTorch}
          style={styles.iconBtn}
        >
          {props.torch ? <Zap size={20} color={scan.warn} fill={scan.warn} /> : <ZapOff size={20} color={scan.text} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={max ? t('scanner.max_hint') : t('scanner.hd_hint')}
          onPress={props.onQuality}
          style={[styles.qualityChip, { borderColor: max ? scan.brandLight : 'rgba(255,255,255,0.7)', backgroundColor: max ? 'rgba(0,82,217,0.55)' : 'transparent' }]}
        >
          <Text style={[styles.qualityText, { fontFamily }]}>{max ? t('scanner.max') : t('scanner.hd')}</Text>
        </Pressable>
        {props.autoCapture !== null ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: props.autoCapture }}
            accessibilityLabel={t('scanner.auto_capture')}
            onPress={props.onAutoCapture}
            style={[styles.autoChip, { backgroundColor: props.autoCapture ? scan.brand : 'rgba(255,255,255,0.12)' }]}
          >
            <Timer size={15} color={scan.text} strokeWidth={2.2} />
            <Text style={[styles.autoText, { fontFamily }]}>{t('scanner.auto_capture')}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.more')} onPress={props.onMore} style={styles.iconBtn}>
          <Ellipsis size={20} color={scan.text} />
        </Pressable>
      </View>
    </View>
  );
}

const modeList: CaptureMode[] = ['auto', 'document', 'id', 'receipt'];

/** The four Phase 1 modes. */
export function ModeSelector({ mode, onChange, disabled }: { mode: CaptureMode; onChange: (m: CaptureMode) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  return (
    <View style={styles.modes} accessibilityRole="tablist">
      {modeList.map((m) => {
        const on = m === mode;
        return (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={() => onChange(m)} hitSlop={8} style={styles.mode}>
            <Text style={[styles.modeText, { fontFamily, color: on ? scan.text : scan.inactive, fontWeight: on ? '600' : '400' }]}>{t(`scanner.mode_${m}`)}</Text>
            <View style={[styles.modeDot, { backgroundColor: on ? scan.brandLight : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 80 px shutter. The ring fills as the page gets ready (A ≈ empty, B partial, C full)
 * and pulses once when ready. Pressing never waits on any animation.
 */
export function ShutterButton({ progress, ready, disabled, onPress }: { progress: number; ready: boolean; disabled: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const [ring] = useState(() => new Animated.Value(progress));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(ring, { toValue: progress, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [progress, ring]);
  useEffect(() => {
    if (!ready) return;
    pulse.setValue(0);
    Animated.timing(pulse, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [ready, pulse]);
  return (
    <Pressable
      testID="shutter"
      accessibilityRole="button"
      accessibilityLabel={t('scanner.shutter')}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ width: SHUTTER, height: SHUTTER, opacity: disabled ? 0.5 : 1 }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulse,
          { opacity: pulse.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] },
        ]}
      />
      <Svg width={SHUTTER} height={SHUTTER} style={StyleSheet.absoluteFill}>
        <Circle cx={40} cy={40} r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={4} />
        <AnimatedCircle
          cx={40}
          cy={40}
          r={r}
          fill="none"
          stroke={ready ? scan.ready : scan.brandLight}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
          transform="rotate(-90 40 40)"
        />
      </Svg>
      <View style={styles.shutterInner} />
    </Pressable>
  );
}

/** Left of the shutter: import photos or PDF. */
export function ImportButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.gallery')} onPress={onPress} disabled={disabled} style={styles.side}>
      <View style={styles.sideIcon}>
        <Images size={26} color={scan.textMuted} strokeWidth={1.8} />
      </View>
      <Text style={[styles.sideText, { fontFamily, color: scan.textMuted }]}>{t('scanner.gallery')}</Text>
    </Pressable>
  );
}

/**
 * Right of the shutter. Before the first page: the multi-page switch (default single).
 * After: a stack of captured pages with the count and "Done"; the top card is the newest
 * page — the raw photo instantly, swapped for the processed preview when ready.
 */
export function PagesButton(props: { pages: DraftPage[]; multi: boolean; onToggleMulti: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  const last = props.pages[props.pages.length - 1];
  if (!last) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: props.multi }}
        accessibilityLabel={t('scanner.multi_page')}
        onPress={props.onToggleMulti}
        style={styles.side}
      >
        <View style={styles.sideIcon}>
          <Layers size={28} color={props.multi ? scan.brandText : scan.textMuted} strokeWidth={1.8} />
        </View>
        <Text style={[styles.sideText, { fontFamily, color: props.multi ? scan.brandText : scan.textMuted, fontWeight: props.multi ? '600' : '400' }]}>
          {props.multi ? t('scanner.multi_page') : t('scanner.single_page')}
        </Text>
      </Pressable>
    );
  }
  const count = props.pages.length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('scanner.pages', { count })} · ${t('scanner.done')}`} onPress={props.onDone} style={styles.side}>
      <View style={styles.sideIcon}>
        {count > 1 ? <View style={[styles.stackBack, { backgroundColor: '#9DA3AD' }]} /> : null}
        <View style={styles.stackFront}>
          <SecureImage uri={last.processedUri} resizeMode="cover" resizeMethod="resize" style={StyleSheet.absoluteFill} />
          {last.processing ? <Beam /> : null}
        </View>
        <View style={styles.badge}>
          <Text style={[styles.badgeText, { fontFamily }]}>{String(count)}</Text>
        </View>
      </View>
      <Text style={[styles.sideText, { fontFamily, color: scan.text, fontWeight: '600' }]}>{t('scanner.done')}</Text>
    </Pressable>
  );
}

/** Scan beam sweeping a page that is still being prepared (mockup D). */
export function Beam({ height = 44 }: { height?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.beam, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }] }]}
    />
  );
}

/** Short white flash on capture (native driver); the camera keeps running underneath. */
export function CaptureFlash({ trigger }: { trigger: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!trigger) return;
    v.setValue(0.55);
    Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [trigger, v]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: v }]} />;
}

/** Card mode, first time only: on-device processing note (dismissible). */
export function PrivacyNote({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  return (
    <View style={styles.privacy}>
      <Lock size={13} color="#DCE6FF" strokeWidth={2.2} />
      <Text style={[styles.privacyText, { fontFamily }]}>{`${t('scanner.privacy_title')} · ${t('scanner.privacy_body')}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('scanner.privacy_dismiss')} onPress={onDismiss} hitSlop={10} style={{ paddingStart: 4 }}>
        <X size={14} color="#DCE6FF" />
      </Pressable>
    </View>
  );
}

/** Single-page capture: the page with a beam and "Preparing document" over the live camera (no blank screen). */
export function PreparingCard({ uri, aspect }: { uri: string; aspect: number }) {
  const { t } = useTranslation();
  const { fontFamily } = useTheme();
  const w = 180;
  const h = Math.min(260, Math.round(w * aspect));
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.66)', gap: 14 }]} pointerEvents="none">
      <View style={[styles.preparing, { width: w, height: h }]}>
        <SecureImage uri={uri} resizeMode="cover" resizeMethod="resize" style={StyleSheet.absoluteFill} />
        <Beam height={h} />
      </View>
      <View style={styles.preparingChip}>
        <Text style={[styles.preparingText, { fontFamily }]}>{t('scanner.preparing')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, backgroundColor: scan.topScrim },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  qualityChip: { height: 30, minWidth: 50, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  qualityText: { color: scan.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  autoChip: { height: 30, paddingStart: 8, paddingEnd: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoText: { color: scan.text, fontSize: 13, fontWeight: '500' },
  modes: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 10 },
  mode: { alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  modeText: { fontSize: 15, lineHeight: 22 },
  modeDot: { width: 5, height: 5, borderRadius: 3 },
  pulse: { position: 'absolute', left: -8, top: -8, width: SHUTTER + 16, height: SHUTTER + 16, borderRadius: (SHUTTER + 16) / 2, borderWidth: 2, borderColor: 'rgba(52,195,143,0.6)' },
  shutterInner: { position: 'absolute', left: 11, top: 11, width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  side: { width: 64, alignItems: 'center', gap: 4 },
  sideIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontSize: 12, lineHeight: 18 },
  stackBack: { position: 'absolute', left: 12, top: 2, width: 34, height: 44, borderRadius: 4 },
  stackFront: { position: 'absolute', left: 6, top: 6, width: 34, height: 44, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FBFBF9', borderWidth: 2, borderColor: scan.brandLight },
  badge: { position: 'absolute', end: -2, top: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: scan.brand, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: scan.text, fontSize: 12, fontWeight: '600' },
  beam: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: scan.brandText, shadowColor: scan.brandLight, shadowOpacity: 0.8, shadowRadius: 6, elevation: 2 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(10,12,16,0.75)' },
  privacyText: { color: '#DCE6FF', fontSize: 12, fontWeight: '500' },
  preparing: { backgroundColor: '#FBFBF9', borderRadius: 4, overflow: 'hidden' },
  preparingChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: scan.chip },
  preparingText: { color: '#DCE6FF', fontSize: 13, fontWeight: '500' },
});
