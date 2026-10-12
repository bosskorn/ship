import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

import { NAppBar, NButton, NChip, NIcon, NIconButton, NInput, NMap, NRow, NSheetPanel, NText } from '@/components';
import { PLACE_TYPE_LABEL, PlaceType } from '@/data/user';
import { useApp } from '@/store/AppStore';
import { color, elevation, layout, space } from '@/theme/tokens';

const DELTA = { latitudeDelta: 0.006, longitudeDelta: 0.006 };

export default function AddressScreen() {
  const { state, setDraft } = useApp();
  const current = state.draft.address;
  const map = useRef<MapView>(null);
  const [coord, setCoord] = useState({ lat: current.lat, lng: current.lng });
  const [line, setLine] = useState(current.line);
  const [district, setDistrict] = useState(current.district);
  const [type, setType] = useState<PlaceType>(current.type);
  const [fields, setFields] = useState({
    houseNo: current.houseNo ?? '',
    building: current.building ?? '',
    floor: current.floor ?? '',
    room: current.room ?? '',
    note: current.note ?? '',
    landmark: current.landmark ?? '',
  });
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof fields) => (v: string) => setFields((f) => ({ ...f, [k]: v }));

  const onRegion = async (r: Region) => {
    setCoord({ lat: r.latitude, lng: r.longitude });
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude });
      if (geo) {
        setLine([geo.streetNumber, geo.street].filter(Boolean).join(' ') || geo.name || line);
        setDistrict([geo.district ?? geo.subregion, geo.city ?? geo.region].filter(Boolean).join(' '));
      }
    } catch {
      // Geocoder unavailable — keep the last known text.
    }
  };

  // Location permission is requested only when the user asks for it (spec §64).
  const locateMe = async () => {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, ...DELTA }, 300);
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    setDraft({
      address: {
        ...current,
        type,
        label: PLACE_TYPE_LABEL[type],
        line,
        district,
        lat: coord.lat,
        lng: coord.lng,
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() || undefined])),
      },
    });
    router.back();
  };

  return (
    <View style={styles.root}>
      <NAppBar title="ที่อยู่รับบริการ" />
      <View style={{ flex: 1 }}>
        <NMap
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: current.lat, longitude: current.lng, ...DELTA }}
          onRegionChangeComplete={onRegion}
          showsUserLocation
        />
        {/* Fixed centre pin: the map moves underneath it */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <NIcon name="location" size={40} color={color.primary} strokeWidth={2.25} />
        </View>
        <View style={[styles.locate, elevation.floating]}>
          <NIconButton icon="navigation" accessibilityLabel="ใช้ตำแหน่งปัจจุบัน" onPress={locateMe} iconColor={locating ? color.textPlaceholder : color.primary} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <NSheetPanel style={{ maxHeight: 460 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheet}>
            <View>
              <NText variant="bodyStrong" numberOfLines={1}>
                {line}
              </NText>
              <NText variant="secondary" color="textSecondary">
                {district}
              </NText>
            </View>
            <NRow gap={space.xs}>
              {(Object.keys(PLACE_TYPE_LABEL) as PlaceType[]).map((t) => (
                <NChip key={t} label={PLACE_TYPE_LABEL[t]} selected={t === type} onPress={() => setType(t)} />
              ))}
            </NRow>
            <NRow gap={space.sm}>
              <View style={{ flex: 1 }}>
                <NInput label="เลขที่" value={fields.houseNo} onChangeText={set('houseNo')} />
              </View>
              <View style={{ flex: 2 }}>
                <NInput label="อาคาร" value={fields.building} onChangeText={set('building')} placeholder={type === 'home' ? 'ไม่บังคับ' : undefined} />
              </View>
            </NRow>
            {type !== 'home' ? (
              <NRow gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <NInput label="ชั้น" value={fields.floor} onChangeText={set('floor')} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <NInput label="ห้อง" value={fields.room} onChangeText={set('room')} />
                </View>
              </NRow>
            ) : null}
            <NInput label="จุดสังเกต" value={fields.landmark} onChangeText={set('landmark')} placeholder="เช่น ประตูสีเทา ตรงข้าม 7-Eleven" />
            <NInput label="หมายเหตุถึงช่าง" value={fields.note} onChangeText={set('note')} placeholder="เช่น จอดรถได้หน้าบ้าน" />
          </ScrollView>
          <View style={styles.cta}>
            <NButton theme="primary" block onPress={save}>
              ยืนยันที่อยู่
            </NButton>
          </View>
        </NSheetPanel>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  locate: { position: 'absolute', right: layout.screenPadding, bottom: space.md, backgroundColor: color.bgContainer, borderRadius: 6 },
  sheet: { paddingHorizontal: layout.screenPadding, gap: space.md, paddingBottom: space.sm },
  cta: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
});
