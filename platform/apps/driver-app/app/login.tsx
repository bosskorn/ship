import { ApiError, Button, color, Field, font, Section, space } from '@ship/mobile-ui';
import { phoneSchema } from '@ship/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { registerPush } from '../lib/push';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();

  const send = async () => {
    setError(null);
    if (!phoneSchema.safeParse(phone).success) return setError('กรุณากรอกเบอร์มือถือให้ถูกต้อง');
    setBusy(true);
    try {
      const r = await api.requestOtp(phone, 'DRIVER');
      setDevCode(r.devCode);
      setStep('otp');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setBusy(true);
    try {
      await api.startDemo('DRIVER');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.verifyOtp(phone, 'DRIVER', code);
      void registerPush();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
          <Text style={[font.title]}>Ship Driver</Text>
          <Text style={[font.body, { color: color.text2, marginTop: space.xs }]}>
            {step === 'phone' ? 'เข้าสู่ระบบหรือสมัครเป็นคนขับด้วยเบอร์มือถือ' : `กรอกรหัส 6 หลักที่ส่งไปที่ ${phone}`}
          </Text>
        </View>
        <Section>
          {step === 'phone' ? (
            <Field label="เบอร์มือถือ" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08X XXX XXXX" autoFocus maxLength={12} textContentType="telephoneNumber" />
          ) : (
            <Field label="รหัส OTP" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoFocus textContentType="oneTimeCode" hint={devCode ? `โหมดพัฒนา: ${devCode}` : undefined} />
          )}
        </Section>
        {error && <Text style={[font.small, { color: color.danger, paddingHorizontal: space.lg, marginTop: space.sm }]}>{error}</Text>}
        <View style={{ padding: space.lg, gap: space.sm }}>
          {step === 'phone' ? (
            <Button title="ขอรหัส OTP" onPress={send} loading={busy} />
          ) : (
            <>
              <Button title="ยืนยัน" onPress={verify} loading={busy} disabled={code.length !== 6} />
              <Button title="เปลี่ยนเบอร์ / ขอรหัสใหม่" variant="text" onPress={() => setStep('phone')} />
            </>
          )}
        </View>
        <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
          <Button title="ทดลองใช้งาน (โหมดสาธิต)" variant="outline" onPress={tryDemo} disabled={busy} />
          <Text style={[font.caption, { color: color.text3, textAlign: 'center' }]}>เข้าดูทุกหน้าด้วยข้อมูลจำลอง ไม่ต้องใช้เบอร์โทรหรือเซิร์ฟเวอร์</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
