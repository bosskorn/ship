import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NongChangLogo } from '@/brand/Logo';
import { NButton, NInput, NText } from '@/components';
import { useAuth } from '@/lib/auth';
import { color, layout, space } from '@/theme/tokens';

const normalize = (v: string) => v.replace(/\D/g, '').slice(0, 10);
const display = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join('-');

export default function Login() {
  const insets = useSafeAreaInsets();
  const { requestOtp } = useAuth();
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = /^0[689]\d{8}$/.test(digits);

  const submit = async () => {
    setLoading(true);
    try {
      const { ref } = await requestOtp(digits);
      router.push({ pathname: '/otp', params: { phone: digits, ref } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { paddingTop: insets.top + space.xxl }]}>
      <View style={styles.body}>
        <NongChangLogo size={44} />
        <View style={{ gap: space.xs, marginTop: space.xxl }}>
          <NText variant="h1">เข้าสู่ระบบ</NText>
          <NText variant="secondary" color="textSecondary">
            ใส่เบอร์มือถือ เราจะส่งรหัส OTP ให้ทาง SMS
          </NText>
        </View>
        <View style={{ marginTop: space.xl }}>
          <NInput
            label="เบอร์มือถือ"
            value={display(digits)}
            onChangeText={(t) => setDigits(normalize(t))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="08x-xxx-xxxx"
            autoFocus
            maxLength={12}
          />
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <NButton theme="primary" block disabled={!valid} loading={loading} onPress={submit}>
          รับรหัส OTP
        </NButton>
        <NText variant="caption" color="textSecondary" align="center">
          การดำเนินการต่อถือว่าคุณยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว
        </NText>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgContainer },
  body: { flex: 1, paddingHorizontal: layout.screenPadding },
  footer: { paddingHorizontal: layout.screenPadding, gap: space.sm },
});
