import { useState } from 'react';
import { Radio } from 'tdesign-react';
import { get } from '../lib/api';
import { km, mins, pct, thb } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const RANGES: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };

export function KpiPage() {
  const [range, setRange] = useState('1d');
  const { data: k } = useAsync(() => {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range] * 86_400_000);
    return get(`/ops/kpis?from=${from.toISOString()}&to=${to.toISOString()}`);
  }, [range], 30_000);

  const t = k?.targets ?? {};
  const tiles: { label: string; value: string; target?: string; ok?: boolean | null }[] = k
    ? [
        { label: 'ออเดอร์', value: String(k.orders) },
        { label: 'Quote → Order conversion', value: pct(k.quoteToOrderConversion) },
        { label: 'Time to match (p50 / p90)', value: `${k.timeToMatchP50S === null ? '–' : Math.round(k.timeToMatchP50S)} / ${k.timeToMatchP90S === null ? '–' : Math.round(k.timeToMatchP90S)} วิ`, target: `< ${t.timeToMatchS} วิ`, ok: k.timeToMatchP50S === null ? null : k.timeToMatchP50S < t.timeToMatchS },
        { label: 'Pickup ETA (เฉลี่ย)', value: mins(k.avgPickupS), target: `< ${t.pickupEtaS / 60} นาที`, ok: k.avgPickupS === null ? null : k.avgPickupS < t.pickupEtaS },
        { label: 'Delivery time (เฉลี่ย)', value: mins(k.avgDeliveryS) },
        { label: 'Acceptance rate', value: pct(k.acceptanceRate), target: `> ${t.acceptanceRate * 100}%`, ok: k.acceptanceRate === null ? null : k.acceptanceRate >= t.acceptanceRate },
        { label: 'Completion rate', value: pct(k.completionRate), target: `> ${t.completionRate * 100}%`, ok: k.completionRate === null ? null : k.completionRate >= t.completionRate },
        { label: 'Cancellation rate', value: pct(k.cancellationRate), target: `< ${t.cancellationRate * 100}%`, ok: k.cancellationRate === null ? null : k.cancellationRate <= t.cancellationRate },
        { label: 'Driver utilization', value: pct(k.driverUtilization) },
        { label: 'Dead mileage / งาน', value: km(k.avgDeadMileageM) },
        { label: 'Revenue / order', value: thb(k.revenuePerOrder) },
        { label: 'Contribution margin / order', value: thb(k.contributionMarginPerOrder), ok: k.contributionMarginPerOrder === null ? null : k.contributionMarginPerOrder > 0 },
        { label: 'Contribution margin รวม', value: thb(k.contributionMarginTotal) },
        { label: 'รายได้คนขับ / ชม. ออนไลน์', value: thb(k.driverEarningsPerOnlineHour) },
        { label: 'Loaded mileage / งาน', value: km(k.avgLoadedMileageM) },
      ]
    : [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="toolbar">
        <Radio.Group variant="default-filled" value={range} onChange={(v) => setRange(String(v))}>
          <Radio.Button value="1d">24 ชม.</Radio.Button>
          <Radio.Button value="7d">7 วัน</Radio.Button>
          <Radio.Button value="30d">30 วัน</Radio.Button>
        </Radio.Group>
        <span className="muted">ลูกค้าจ่ายเหมาะสม · คนขับคุ้ม · บริษัทเหลือ margin — ดูทั้งสามด้านพร้อมกัน</span>
      </div>
      <div className="kpi-grid">
        {tiles.map((x) => (
          <div className="panel kpi" key={x.label}>
            <div className="label">{x.label}</div>
            <div className={`value ${x.ok === false ? 'bad' : ''}`}>{x.value}</div>
            {x.target && <div className={`target ${x.ok === null || x.ok === undefined ? 'muted' : x.ok ? 'ok' : 'bad'}`}>เป้าหมาย {x.target}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
