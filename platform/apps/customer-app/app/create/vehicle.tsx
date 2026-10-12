import { Feather } from '@expo/vector-icons';
import { ApiError, BottomBar, Button, color, Empty, font, km, minutes, Money, Section, space } from '@ship/mobile-ui';
import { QuoteOption, VEHICLE_TH } from '@ship/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useCountdown } from '../../lib/hooks';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { quoteRequest, useDraft } from '../../lib/draft';

const ICON: Record<string, keyof typeof Feather.glyphMap> = { MOTORCYCLE: 'navigation', CAR: 'truck', PICKUP: 'truck', VAN: 'truck' };
const REASON_TH: Record<string, string> = {
  PARCEL_TOO_HEAVY: 'น้ำหนักเกินที่รถประเภทนี้รับได้',
  VEHICLE_NOT_IN_ZONE: 'ยังไม่ให้บริการในพื้นที่นี้',
  NO_PRICING: 'ยังไม่เปิดให้บริการ',
  MARGIN_GUARD: 'ไม่พร้อมให้บริการในขณะนี้',
};

export default function Vehicle() {
  const { draft, update } = useDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = draft.options;
  const expiresAt = options.find((o) => o.available)?.expiresAt ?? null;
  const left = useCountdown(expiresAt);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.post('/quotes', quoteRequest(draft));
      const firstAvailable = r.options.find((o: QuoteOption) => o.available);
      update({ options: r.options, zoneName: r.zone?.name ?? null, vehicleType: draft.vehicleType && r.options.some((o: QuoteOption) => o.available && o.vehicleType === draft.vehicleType) ? draft.vehicleType : firstAvailable?.vehicleType ?? null });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pickup, draft.dropoffs, draft.parcel, draft.scheduledAt, draft.optimizeRoute]);

  useEffect(() => {
    if (!options.length) void fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expired = !!expiresAt && left === 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        {loading && <ActivityIndicator style={{ marginTop: space.xl }} color={color.brand} />}
        {error && <Empty text={error} />}
        {!loading && !!options.length && (
          <Section title={`เลือกรถ · ${km(options[0].distanceM)}${draft.zoneName ? ` · ${draft.zoneName}` : ''}`}>
            {options.map((o, i) => {
              const v = VEHICLE_TH[o.vehicleType];
              const active = draft.vehicleType === o.vehicleType;
              return (
                <Pressable
                  key={o.vehicleType}
                  disabled={!o.available}
                  onPress={() => update({ vehicleType: o.vehicleType })}
                  style={{
                    flexDirection: 'row',
                    padding: space.md,
                    alignItems: 'center',
                    gap: space.md,
                    backgroundColor: active ? color.brandLight : color.surface,
                    borderLeftWidth: 3,
                    borderLeftColor: active ? color.brand : 'transparent',
                    borderBottomWidth: i === options.length - 1 ? 0 : 1,
                    borderBottomColor: color.divider,
                    opacity: o.available ? 1 : 0.45,
                  }}
                >
                  <Feather name={ICON[o.vehicleType]} size={22} color={active ? color.brand : color.text2} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.bodyStrong}>{v.name}</Text>
                    <Text style={[font.caption, { color: color.text3 }]}>
                      {v.description} · ≤ {v.maxWeightKg} กก. · {v.dimensions}
                    </Text>
                    <Text style={[font.caption, { color: o.available ? color.text2 : color.danger, marginTop: 2 }]}>
                      {o.available ? (o.driverEtaS ? `คนขับถึงใน ~${minutes(o.driverEtaS)}` : 'กำลังหาคนขับใกล้คุณ') + ` · ส่งถึง ~${minutes(o.durationS)}` : REASON_TH[o.unavailableReason ?? ''] ?? 'ไม่พร้อมให้บริการ'}
                    </Text>
                  </View>
                  {o.available && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Money satang={o.price} strong />
                      {o.surgeMilli > 1000 && <Text style={[font.caption, { color: color.warning }]}>ช่วงความต้องการสูง</Text>}
                      {o.breakdown.promotionDiscount > 0 && <Text style={[font.caption, { color: color.success }]}>ลด <Money satang={o.breakdown.promotionDiscount} size="small" /></Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Section>
        )}
        {!!expiresAt && (
          <Text style={[font.caption, { color: expired ? color.danger : color.text3, textAlign: 'center', marginTop: space.md }]}>
            {expired ? 'ราคาหมดอายุแล้ว กรุณาขอราคาใหม่' : `ราคานี้มีผล ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} นาที`}
          </Text>
        )}
      </ScrollView>
      <BottomBar>
        {expired || error ? (
          <Button title="ขอราคาใหม่" onPress={fetchQuotes} loading={loading} />
        ) : (
          <Button title="ถัดไป: ชำระเงิน" disabled={!draft.vehicleType || loading} onPress={() => router.push('/create/review')} />
        )}
      </BottomBar>
    </View>
  );
}
