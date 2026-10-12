import { Feather } from '@expo/vector-icons';
import { BottomBar, Button, Cell, color, Field, font, Section, space } from '@ship/mobile-ui';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { api } from '../../lib/api';
import { DraftStop, stopReady, useDraft } from '../../lib/draft';

const BKK: Region = { latitude: 13.7563, longitude: 100.5018, latitudeDelta: 0.02, longitudeDelta: 0.02 };

/** Move the map under a fixed centre pin (spec §6: customer can adjust the pin). */
export default function LocationPicker() {
  const { target } = useLocalSearchParams<{ target: string }>();
  const { getStop, setStop, draft } = useDraft();
  const [stop, setLocal] = useState<DraftStop>(() => getStop(target));
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(false);
  const [zoneOk, setZoneOk] = useState<boolean | null>(null);
  const mapRef = useRef<MapView>(null);
  const isPickup = target === 'pickup';

  useEffect(() => {
    if (stop.location) return;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({ ...BKK, latitude: p.coords.latitude, longitude: p.coords.longitude }, 300);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // pickup defaults to the customer as sender
    if (isPickup && !stop.contactName) {
      void api.get('/auth/me').then((u) => setLocal((s) => ({ ...s, contactName: s.contactName || u.display_name || '', contactPhone: s.contactPhone || (u.phone ?? '').replace('+66', '0') })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRegion = async (r: Region) => {
    const location = { lat: r.latitude, lng: r.longitude };
    setLocal((s) => ({ ...s, location }));
    setResolving(true);
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude });
      if (g) setLocal((s) => ({ ...s, address: [g.name, g.street, g.district, g.subregion, g.city].filter(Boolean).join(' ') }));
      if (isPickup) {
        const z = await api.get(`/zones/lookup?lat=${location.lat}&lng=${location.lng}`);
        setZoneOk(z.serviceable);
      }
    } catch {
      /* geocoder unavailable: user can type the address */
    } finally {
      setResolving(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    const [hit] = await Location.geocodeAsync(query).catch(() => []);
    if (hit) mapRef.current?.animateToRegion({ ...BKK, latitude: hit.latitude, longitude: hit.longitude }, 300);
  };

  const set = (k: keyof DraftStop) => (v: string) => setLocal((s) => ({ ...s, [k]: v }));
  const initial = stop.location ? { ...BKK, latitude: stop.location.lat, longitude: stop.location.lng } : BKK;
  const multi = draft.dropoffs.length > 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ height: 280 }}>
        <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initial} onRegionChangeComplete={onRegion} showsUserLocation showsMyLocationButton toolbarEnabled={false} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="map-pin" size={34} color={isPickup ? color.success : color.warning} style={{ marginBottom: 34 }} />
        </View>
        <View style={{ position: 'absolute', top: space.sm, left: space.sm, right: space.sm, flexDirection: 'row', backgroundColor: color.surface, borderRadius: 3, borderWidth: 1, borderColor: color.border, alignItems: 'center', paddingHorizontal: space.sm }}>
          <Feather name="search" size={16} color={color.text3} />
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="ค้นหาสถานที่" returnKeyType="search" style={[font.body, { flex: 1, height: 40, marginLeft: space.sm }]} placeholderTextColor={color.placeholder} />
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {isPickup && zoneOk === false && <Text style={[font.small, { color: color.danger, padding: space.md }]}>จุดนี้อยู่นอกพื้นที่ให้บริการ</Text>}
        <Section title={isPickup ? 'จุดรับสินค้า' : 'จุดส่งสินค้า'} style={{ marginTop: space.sm }}>
          <Field label={resolving ? 'ที่อยู่ (กำลังค้นหา...)' : 'ที่อยู่'} value={stop.address} onChangeText={set('address')} multiline />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 2 }}>
              <Field label="อาคาร / หมู่บ้าน" value={stop.building ?? ''} onChangeText={set('building')} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="ชั้น" value={stop.floor ?? ''} onChangeText={set('floor')} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="ห้อง" value={stop.room ?? ''} onChangeText={set('room')} />
            </View>
          </View>
        </Section>
        <Section title={isPickup ? 'ผู้ส่ง' : 'ผู้รับ'}>
          <Field label="ชื่อผู้ติดต่อ" value={stop.contactName} onChangeText={set('contactName')} />
          <Field label="เบอร์โทร" value={stop.contactPhone} onChangeText={set('contactPhone')} keyboardType="phone-pad" maxLength={12} />
          <Field label="หมายเหตุถึงคนขับ" value={stop.note ?? ''} onChangeText={set('note')} placeholder="เช่น รอที่ล็อบบี้ ประตู 2" />
        </Section>
        {!isPickup && multi && (
          <Section>
            <Cell title="ล็อกลำดับจุดนี้" description="ระบบจะไม่สลับลำดับของจุดนี้เมื่อจัดเส้นทาง" value={<Switch value={!!stop.locked} onValueChange={(v) => setLocal((s) => ({ ...s, locked: v }))} />} last />
          </Section>
        )}
      </ScrollView>
      <BottomBar>
        <Button
          title="ใช้ตำแหน่งนี้"
          disabled={!stopReady(stop) || (isPickup && zoneOk === false)}
          onPress={() => {
            setStop(target, { ...stop, contactPhone: stop.contactPhone.replace(/[\s-]/g, '') });
            router.back();
          }}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
