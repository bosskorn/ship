import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { NAppBar, NButton, NText } from '@/components';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { color, layout, radius, space, typography } from '@/theme/tokens';

const LENGTH = 6;

export default function Otp() {
  const { phone = '', ref = '' } = useLocalSearchParams<{ phone: string; ref: string }>();
  const { verifyOtp, requestOtp } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(60);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const verify = async (value: string) => {
    setLoading(true);
    setError(undefined);
    const ok = await verifyOtp(phone, value);
    setLoading(false);
    if (!ok) {
      haptic.warning();
      setError('รหัสไม่ถูกต้อง ลองอีกครั้ง');
      setCode('');
    }
    // On success the protected stack swaps to the tabs automatically.
  };

  return (
    <View style={styles.root}>
      <NAppBar />
      <View style={styles.body}>
        <NText variant="h1">ใส่รหัส OTP</NText>
        <NText variant="secondary" color="textSecondary" style={{ marginTop: space.xs }}>
          ส่งไปที่ {phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')} · Ref {ref}
        </NText>

        <Pressable style={styles.cells} onPress={() => input.current?.focus()} accessibilityLabel="ช่องกรอกรหัส OTP">
          {Array.from({ length: LENGTH }, (_, i) => {
            const active = i === code.length;
            return (
              <View key={i} style={[styles.cell, active && styles.cellActive, !!error && styles.cellError]}>
                <NText style={typography.h2}>{code[i] ?? ''}</NText>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const v = t.replace(/\D/g, '').slice(0, LENGTH);
            setCode(v);
            if (v.length === LENGTH) verify(v);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LENGTH}
          style={styles.hidden}
        />
        {error ? (
          <NText variant="secondary" color="error" style={{ marginTop: space.sm }}>
            {error}
          </NText>
        ) : null}

        <View style={{ marginTop: space.xl, alignItems: 'flex-start' }}>
          {resendIn > 0 ? (
            <NText variant="secondary" color="textSecondary">
              ส่งรหัสใหม่ได้ใน {resendIn} วินาที
            </NText>
          ) : (
            <NButton
              theme="text"
              size="small"
              onPress={async () => {
                await requestOtp(phone);
                setResendIn(60);
              }}
            >
              ส่งรหัสใหม่
            </NButton>
          )}
        </View>
      </View>
      <View style={styles.footer}>
        <NButton theme="primary" block loading={loading} disabled={code.length !== LENGTH} onPress={() => verify(code)}>
          ยืนยัน
        </NButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgContainer },
  body: { flex: 1, paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  cells: { flexDirection: 'row', gap: space.xs, marginTop: space.xl },
  cell: {
    flex: 1,
    height: 56,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: color.primary },
  cellError: { borderColor: color.error },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  footer: { padding: layout.screenPadding },
});
