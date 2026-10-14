import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/design-system';
import { scan } from './scannerStyle';

export type CoachTone = 'neutral' | 'warn' | 'ready';

/**
 * The scanner's single coaching message (mockup "Coach"): one line, optional sub-line,
 * on a scrim so it reads over any scene. Fades on change (native driver).
 */
export function QualityCoach({ tone, message, sub, chip }: { tone: CoachTone; message: string; sub?: string; chip?: string }) {
  const { fontFamily } = useTheme();
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    fade.setValue(0.4);
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [message, fade]);
  const iconBg = tone === 'ready' ? scan.ready : tone === 'warn' ? scan.warn : 'rgba(255,255,255,0.18)';
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.pill, { opacity: fade }]}>
        <View style={[styles.icon, { backgroundColor: iconBg }]}>
          {tone === 'ready' ? (
            <Check size={13} color="#0B0D11" strokeWidth={3} />
          ) : tone === 'warn' ? (
            <Text style={styles.bang}>!</Text>
          ) : (
            <View style={styles.dot} />
          )}
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.msg, { fontFamily }]}>{message}</Text>
          {sub ? <Text style={[styles.sub, { fontFamily }]}>{sub}</Text> : null}
        </View>
      </Animated.View>
      {chip ? (
        <View style={styles.chip}>
          <Text style={[styles.chipText, { fontFamily }]}>{chip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 340, paddingVertical: 8, paddingStart: 12, paddingEnd: 16, borderRadius: 22, backgroundColor: scan.pill },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: scan.text },
  bang: { color: '#0B0D11', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  msg: { color: scan.text, fontSize: 16, fontWeight: '600', lineHeight: 24 },
  sub: { color: scan.textMuted, fontSize: 13, lineHeight: 19 },
  chip: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: scan.chip },
  chipText: { color: '#B9D0FF', fontSize: 12, fontWeight: '500', lineHeight: 18 },
});
