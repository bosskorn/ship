import { Feather } from '@expo/vector-icons';
import { ApiError, BottomBar, Button, Cell, color, Field, font, Section, space, Tag } from '@ship/mobile-ui';
import { KYC_STATUS_TH, KycStatus, VEHICLE_TH, VEHICLE_TYPES, VehicleType } from '@ship/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useDriver } from '../lib/driver';

const DOCS: { kind: string; label: string }[] = [
  { kind: 'SELFIE', label: 'รูปถ่ายหน้าตรง' },
  { kind: 'NATIONAL_ID', label: 'บัตรประชาชน' },
  { kind: 'DRIVER_LICENSE', label: 'ใบขับขี่' },
  { kind: 'VEHICLE_REGISTRATION', label: 'เล่มทะเบียนรถ' },
  { kind: 'VEHICLE_PHOTO', label: 'รูปรถเห็นป้ายทะเบียน (ไม่บังคับ)' },
  { kind: 'BANK_BOOK', label: 'หน้าสมุดบัญชี (ไม่บังคับ)' },
];

/** Driver registration + KYC (spec §30). Sensitive fields are encrypted server-side. */
export default function Onboarding() {
  const { me, reload } = useDriver();
  const locked = ['REVIEW', 'APPROVED', 'SUSPENDED'].includes(me.kyc_status);
  const [p, setP] = useState({ firstName: me.first_name ?? '', lastName: me.last_name ?? '', nationalId: '', licenseNumber: '', licenseExpiry: '', emergencyContactName: '', emergencyContactPhone: '', bankName: '', bankAccountNumber: '', bankAccountName: '' });
  const [v, setV] = useState({ type: 'MOTORCYCLE' as VehicleType, plateNumber: '', plateProvince: 'กรุงเทพมหานคร', brand: '', model: '', color: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const saveProfile = async () => {
    setBusy('profile');
    try {
      await api.put('/driver/profile', {
        ...p,
        emergencyContactName: p.emergencyContactName || undefined,
        emergencyContactPhone: p.emergencyContactPhone || undefined,
        bankName: p.bankName || undefined,
        bankAccountNumber: p.bankAccountNumber || undefined,
        bankAccountName: p.bankAccountName || undefined,
      });
      await reload();
      Alert.alert('บันทึกแล้ว', 'ข้อมูลส่วนตัวถูกเข้ารหัสและบันทึกเรียบร้อย');
    } catch (e) {
      Alert.alert('บันทึกไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const addVehicle = async () => {
    setBusy('vehicle');
    try {
      await api.post('/driver/vehicles', { ...v, brand: v.brand || undefined, model: v.model || undefined, color: v.color || undefined });
      await reload();
    } catch (e) {
      Alert.alert('เพิ่มรถไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (kind: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('ต้องการสิทธิ์กล้อง');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7, cameraType: kind === 'SELFIE' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });
    if (r.canceled) return;
    setBusy(kind);
    try {
      const key = await api.uploadFile(r.assets[0].uri, 'KYC');
      await api.post('/driver/documents', { kind, fileKey: key });
      await reload();
    } catch (e) {
      Alert.alert('อัปโหลดไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy('submit');
    try {
      await api.post('/driver/kyc/submit');
      await reload();
    } catch (e) {
      const err = e as ApiError;
      Alert.alert('ส่งตรวจสอบไม่ได้', err.details?.missing ? `${err.message}: ${err.details.missing.join(', ')}` : err.message);
    } finally {
      setBusy(null);
    }
  };

  const docStatus = (kind: string) => me.documents.find((d: any) => d.kind === kind)?.status as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={{ padding: space.lg, backgroundColor: color.surface, gap: space.xs }}>
          <Tag text={KYC_STATUS_TH[me.kyc_status as KycStatus]} tone={me.kyc_status === 'REJECTED' || me.kyc_status === 'SUSPENDED' ? 'danger' : me.kyc_status === 'REVIEW' ? 'warning' : 'neutral'} />
          <Text style={font.h2}>{me.kyc_status === 'REVIEW' ? 'เอกสารอยู่ระหว่างตรวจสอบ' : me.kyc_status === 'SUSPENDED' ? 'บัญชีถูกระงับ' : 'กรอกข้อมูลให้ครบเพื่อเริ่มรับงาน'}</Text>
          {me.kyc_note && <Text style={[font.small, { color: color.danger }]}>หมายเหตุจากทีมงาน: {me.kyc_note}</Text>}
          {me.kyc_status === 'REVIEW' && <Text style={[font.small, { color: color.text2 }]}>ทีมงานจะแจ้งผลทาง SMS และแจ้งเตือนในแอป โดยปกติภายใน 1 วันทำการ</Text>}
        </View>

        <Section title="1. ข้อมูลส่วนตัว">
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Field label="ชื่อ" value={p.firstName} onChangeText={(t) => setP({ ...p, firstName: t })} editable={!locked} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="นามสกุล" value={p.lastName} onChangeText={(t) => setP({ ...p, lastName: t })} editable={!locked} />
            </View>
          </View>
          <Field label={me.has_national_id ? 'เลขบัตรประชาชน (บันทึกแล้ว · กรอกใหม่เพื่อแก้ไข)' : 'เลขบัตรประชาชน 13 หลัก'} value={p.nationalId} onChangeText={(t) => setP({ ...p, nationalId: t.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={13} editable={!locked} />
          <Field label="เลขที่ใบขับขี่" value={p.licenseNumber} onChangeText={(t) => setP({ ...p, licenseNumber: t })} editable={!locked} />
          <Field label="ใบขับขี่หมดอายุ (ปปปป-ดด-วว)" value={p.licenseExpiry} onChangeText={(t) => setP({ ...p, licenseExpiry: t })} placeholder="2030-12-31" editable={!locked} />
          <Field label="ผู้ติดต่อฉุกเฉิน" value={p.emergencyContactName} onChangeText={(t) => setP({ ...p, emergencyContactName: t })} editable={!locked} />
          <Field label="เบอร์ผู้ติดต่อฉุกเฉิน" value={p.emergencyContactPhone} onChangeText={(t) => setP({ ...p, emergencyContactPhone: t })} keyboardType="phone-pad" editable={!locked} />
          <Field label="ธนาคาร (รับเงิน)" value={p.bankName} onChangeText={(t) => setP({ ...p, bankName: t })} placeholder="เช่น KBANK" editable={!locked} />
          <Field label="เลขบัญชี" value={p.bankAccountNumber} onChangeText={(t) => setP({ ...p, bankAccountNumber: t.replace(/\D/g, '') })} keyboardType="number-pad" editable={!locked} />
          <Field label="ชื่อบัญชี" value={p.bankAccountName} onChangeText={(t) => setP({ ...p, bankAccountName: t })} editable={!locked} />
          {!locked && (
            <View style={{ padding: space.md }}>
              <Button title="บันทึกข้อมูลส่วนตัว" variant="outline" onPress={saveProfile} loading={busy === 'profile'} disabled={!p.firstName || !p.lastName || p.nationalId.length !== 13 || !p.licenseNumber || !/^\d{4}-\d{2}-\d{2}$/.test(p.licenseExpiry)} />
            </View>
          )}
        </Section>

        <Section title="2. ข้อมูลรถ">
          {me.vehicles.map((x: any) => (
            <Cell key={x.id} title={`${VEHICLE_TH[x.type as VehicleType].name} · ${x.plate_number} ${x.plate_province}`} description={[x.brand, x.model, x.color].filter(Boolean).join(' ')} value={<Tag text={x.status} tone={x.status === 'APPROVED' ? 'success' : 'neutral'} />} />
          ))}
          {!me.vehicles.length && !locked && (
            <>
              <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, flexWrap: 'wrap' }}>
                {VEHICLE_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setV({ ...v, type: t })} style={{ paddingHorizontal: space.md, height: 36, justifyContent: 'center', borderRadius: 3, borderWidth: 1, borderColor: v.type === t ? color.brand : color.border, backgroundColor: v.type === t ? color.brandLight : color.surface }}>
                    <Text style={[font.small, { color: v.type === t ? color.brand : color.text }]}>{VEHICLE_TH[t].name}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="ทะเบียนรถ" value={v.plateNumber} onChangeText={(t) => setV({ ...v, plateNumber: t })} placeholder="1กข 1234" />
              <Field label="จังหวัด" value={v.plateProvince} onChangeText={(t) => setV({ ...v, plateProvince: t })} />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}>
                  <Field label="ยี่ห้อ" value={v.brand} onChangeText={(t) => setV({ ...v, brand: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="รุ่น" value={v.model} onChangeText={(t) => setV({ ...v, model: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="สี" value={v.color} onChangeText={(t) => setV({ ...v, color: t })} />
                </View>
              </View>
              <View style={{ padding: space.md }}>
                <Button title="เพิ่มรถ" variant="outline" onPress={addVehicle} loading={busy === 'vehicle'} disabled={v.plateNumber.length < 2} />
              </View>
            </>
          )}
        </Section>

        <Section title="3. เอกสาร (ถ่ายด้วยกล้อง)">
          {DOCS.map((d, i) => {
            const st = docStatus(d.kind);
            return (
              <Cell
                key={d.kind}
                title={d.label}
                left={<Feather name={st ? 'check-circle' : 'camera'} size={18} color={st ? color.success : color.text3} />}
                value={busy === d.kind ? <ActivityIndicator /> : st ? <Tag text={st === 'SUBMITTED' ? 'ส่งแล้ว' : st} tone={st === 'REJECTED' ? 'danger' : 'success'} /> : undefined}
                onPress={locked ? undefined : () => upload(d.kind)}
                arrow={!locked}
                last={i === DOCS.length - 1}
              />
            );
          })}
        </Section>
      </ScrollView>
      <BottomBar>
        {locked ? (
          <Button title="ตรวจสอบสถานะอีกครั้ง" variant="outline" onPress={reload} />
        ) : (
          <Button title="ส่งให้ทีมงานตรวจสอบ" onPress={submit} loading={busy === 'submit'} disabled={!!me.missingDocuments.length || !me.vehicles.length || !me.has_national_id} />
        )}
        <Button title="ออกจากระบบ" variant="text" onPress={() => void api.logout()} />
      </BottomBar>
    </View>
  );
}
