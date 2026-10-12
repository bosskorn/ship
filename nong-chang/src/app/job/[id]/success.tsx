import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { NButton, NPrice, NText } from '@/components';
import { haptic } from '@/lib/haptics';
import { useJob } from '@/store/AppStore';
import { color, layout, motion, space } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M30 52 L44 66 L72 36';
const CHECK_LEN = 62;

/** Full-screen native success (spec §37): ~650ms check + success haptic. */
export default function PaymentSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const insets = useSafeAreaInsets();
  const circle = useSharedValue(0);
  const check = useSharedValue(0);
  const text = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(0.2, 0, 0, 1);
    circle.value = withTiming(1, { duration: 260, easing: ease });
    check.value = withDelay(200, withTiming(1, { duration: 300, easing: ease }));
    text.value = withDelay(motion.success - 250, withTiming(1, { duration: 250 }));
    const t = setTimeout(() => haptic.success(), 220);
    return () => clearTimeout(t);
  }, [circle, check, text]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + circle.value * 0.4 }], opacity: circle.value }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - check.value) }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 8 }] }));

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.circle, circleStyle]}>
          <Svg width={104} height={104} viewBox="0 0 104 104">
            <AnimatedPath d={CHECK} stroke={color.textOnPrimary} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[CHECK_LEN, CHECK_LEN]} animatedProps={checkProps} />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.text, textStyle]}>
          <NText variant="h1">ชำระเงินสำเร็จ</NText>
          <NPrice amount={job?.total ?? 0} size="large" decimals />
          <NText variant="secondary" color="textSecondary" align="center">
            ขอบคุณที่ใช้บริการน้องช่าง งานนี้อยู่ในการรับประกันแล้ว
          </NText>
        </Animated.View>
      </View>
      <View style={styles.actions}>
        <NButton theme="primary" block onPress={() => router.replace(`/job/${id}/review`)}>
          ให้คะแนนช่าง
        </NButton>
        <View style={styles.row}>
          <NButton theme="default" style={{ flex: 1 }} onPress={() => router.replace(`/job/${id}`)}>
            ดูใบเสร็จ
          </NButton>
          <NButton theme="default" style={{ flex: 1 }} onPress={() => router.dismissTo('/')}>
            กลับหน้าแรก
          </NButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  circle: { width: 104, height: 104, borderRadius: 52, backgroundColor: color.success, alignItems: 'center', justifyContent: 'center' },
  text: { alignItems: 'center', gap: space.xs },
  actions: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
});
