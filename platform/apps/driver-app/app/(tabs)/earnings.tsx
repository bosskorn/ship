import { Cell, color, dateShort, font, km, Money, Section, Segmented, space } from '@ship/mobile-ui';
import type { EarningsSummary } from '@ship/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';

type Period = 'today' | 'week' | 'month';
const TYPE_TH: Record<string, string> = { TRIP: 'ค่ารอบ', TIP: 'ทิป', BONUS: 'โบนัส', ADJUSTMENT: 'ปรับปรุงยอด' };

/** Spec §17: gross, GP, bonus, tips, adjustment, net — today / week / month. */
export default function Earnings() {
  const [period, setPeriod] = useState<Period>('today');
  const [s, setS] = useState<EarningsSummary | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [sum, list] = await Promise.all([api.get<EarningsSummary>(`/driver/earnings?period=${period}`), api.get('/driver/earnings/items')]);
    setS(sum);
    setItems(list.filter((x: any) => new Date(x.earnedAt) >= new Date(sum.from)));
  }, [period]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const hours = (s?.onlineSeconds ?? 0) / 3600;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <View style={{ padding: space.md, backgroundColor: color.surface }}>
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'today', label: 'วันนี้' }, { value: 'week', label: 'สัปดาห์นี้' }, { value: 'month', label: 'เดือนนี้' }]} />
        <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
          <Text style={[font.small, { color: color.text2 }]}>รายได้สุทธิ</Text>
          <Money satang={s?.netEarnings ?? 0} size="number" />
          <Text style={[font.caption, { color: color.text3, marginTop: space.xs }]}>
            {s?.trips ?? 0} งาน · ออนไลน์ {hours.toFixed(1)} ชม.{hours > 0.1 && s ? ` · ≈ ฿${Math.round(s.netEarnings / 100 / hours)}/ชม.` : ''}
          </Text>
        </View>
      </View>
      <Section title="รายละเอียด">
        <Cell title="ค่ารอบรวม (Gross fare)" value={<Money satang={s?.grossFare ?? 0} />} />
        <Cell title="GP / คอมมิชชัน" value={<Text style={[font.body, { color: color.danger }]}>-฿{((s?.commission ?? 0) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>} />
        <Cell title="โบนัส / Incentive" value={<Money satang={s?.bonus ?? 0} />} />
        <Cell title="ทิป" value={<Money satang={s?.tips ?? 0} />} />
        <Cell title="ปรับปรุงยอด" value={<Money satang={s?.adjustment ?? 0} />} />
        <Cell title={<Text style={font.bodyStrong}>รายได้สุทธิ</Text>} value={<Money satang={s?.netEarnings ?? 0} strong />} last />
      </Section>
      <Section title="ระยะทาง">
        <Cell title="วิ่งรถเปล่าไปจุดรับ (dead mileage)" value={km(s?.deadMileageM)} />
        <Cell title="วิ่งพร้อมสินค้า" value={km(s?.loadedMileageM)} last />
      </Section>
      <Section title="รายการ">
        {items.map((x, i) => (
          <Cell
            key={x.id}
            title={`${TYPE_TH[x.type] ?? x.type}${x.orderNo ? ` · ${x.orderNo}` : ''}`}
            description={`${dateShort(x.earnedAt)}${x.type === 'TRIP' ? ` · ค่ารอบ ฿${(x.grossFare / 100).toFixed(2)} − GP ฿${(x.commission / 100).toFixed(2)}${x.bonus ? ` + โบนัส ฿${(x.bonus / 100).toFixed(2)}` : ''}` : ''}${x.cashCollected ? ` · เก็บเงินสด ฿${(x.cashCollected / 100).toFixed(0)}` : ''}`}
            value={<Money satang={x.net} />}
            last={i === items.length - 1}
          />
        ))}
        {!items.length && <Cell title={<Text style={[font.small, { color: color.text3 }]}>ยังไม่มีรายการในช่วงนี้</Text>} last />}
      </Section>
    </ScrollView>
  );
}
