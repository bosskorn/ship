import { useEffect, useState } from 'react';
import { Button, Input, InputNumber, Select, Space, Switch, Table, Textarea } from 'tdesign-react';
import { Field, Fields } from '../components/Field';
import { get, put } from '../lib/api';
import { run } from '../lib/useAsync';

export function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [reason, setReason] = useState('');
  useEffect(() => void run(async () => setS(await get('/ops/settings'))), []);
  if (!s) return null;

  const save = async () => {
    const ok = await run(() => put('/ops/settings', { data: s, reason }), 'บันทึกการตั้งค่าแล้ว');
    if (ok) setReason('');
  };
  const num = (path: string[], label: string, opts: { suffix?: string; scale?: number; decimals?: number } = {}) => {
    const scale = opts.scale ?? 1;
    const v = path.reduce((o, k) => o?.[k], s);
    return (
      <Field label={label}>
        <InputNumber
          value={v / scale}
          decimalPlaces={opts.decimals ?? 0}
          suffix={opts.suffix}
          onChange={(nv) => {
            const next = structuredClone(s);
            let o = next;
            for (const k of path.slice(0, -1)) o = o[k];
            o[path[path.length - 1]] = Math.round(Number(nv) * scale);
            setS(next);
          }}
        />
      </Field>
    );
  };

  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-head">Margin guard & ต้นทุนแปรผัน</div>
        <div className="panel-body">
          <Fields inline>
            {num(['minContributionMarginSatang'], 'Minimum contribution margin / order', { suffix: '฿', scale: 100, decimals: 2 })}
            <Field label="เมื่อต่ำกว่า minimum">
              <Select value={s.marginGuardMode} onChange={(v) => setS({ ...s, marginGuardMode: v })} options={[{ value: 'BLOCK', label: 'ไม่เปิดขายตัวเลือกนั้น' }, { value: 'SERVICE_FEE', label: 'เพิ่ม service fee' }]} />
            </Field>
            {num(['paymentFeeBp', 'CASH'], 'ค่าธรรมเนียม เงินสด', { suffix: '%', scale: 100, decimals: 2 })}
            {num(['paymentFeeBp', 'QR'], 'ค่าธรรมเนียม QR', { suffix: '%', scale: 100, decimals: 2 })}
            {num(['paymentFeeBp', 'CARD'], 'ค่าธรรมเนียม บัตร', { suffix: '%', scale: 100, decimals: 2 })}
            {num(['insuranceRiskBp'], 'Insurance / risk reserve', { suffix: '%', scale: 100, decimals: 2 })}
            {num(['otherVariableCostSatang'], 'ต้นทุนแปรผันอื่น / order', { suffix: '฿', scale: 100, decimals: 2 })}
          </Fields>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">Quote / Offer / Geofence</div>
        <div className="panel-body">
          <Fields inline>
            {num(['quoteTtlSeconds'], 'อายุใบเสนอราคา', { suffix: 'วินาที' })}
            {num(['offerTtlSeconds'], 'เวลาตัดสินใจรับงาน', { suffix: 'วินาที' })}
            {num(['pickupGeofenceM'], 'Geofence จุดรับ', { suffix: 'ม.' })}
            {num(['dropoffGeofenceM'], 'Geofence จุดส่ง', { suffix: 'ม.' })}
            {num(['scheduledDispatchLeadMin'], 'เริ่มหาคนขับก่อนเวลานัด', { suffix: 'นาที' })}
          </Fields>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">Dispatch waves</div>
        <div className="panel-body">
          <Table
            size="small"
            rowKey="i"
            data={s.dispatchWaves.map((w: any, i: number) => ({ ...w, i }))}
            columns={[
              { colKey: 'i', title: 'Wave', width: 60, cell: ({ row }) => row.i + 1 },
              { colKey: 'radiusM', title: 'รัศมี (ม.)', cell: ({ row }) => <InputNumber size="small" value={row.radiusM} onChange={(v) => setWave(row.i, 'radiusM', Number(v))} /> },
              { colKey: 'maxOffers', title: 'ส่งให้กี่คน', cell: ({ row }) => <InputNumber size="small" value={row.maxOffers} onChange={(v) => setWave(row.i, 'maxOffers', Number(v))} /> },
              { colKey: 'incentiveSatang', title: 'Incentive (฿)', cell: ({ row }) => <InputNumber size="small" decimalPlaces={2} value={row.incentiveSatang / 100} onChange={(v) => setWave(row.i, 'incentiveSatang', Math.round(Number(v) * 100))} /> },
            ]}
          />
          <Space style={{ marginTop: 8 }}>
            <Button size="small" variant="outline" disabled={s.dispatchWaves.length >= 6} onClick={() => setS({ ...s, dispatchWaves: [...s.dispatchWaves, { ...s.dispatchWaves[s.dispatchWaves.length - 1] }] })}>
              เพิ่ม wave
            </Button>
            <Button size="small" variant="outline" disabled={s.dispatchWaves.length <= 1} onClick={() => setS({ ...s, dispatchWaves: s.dispatchWaves.slice(0, -1) })}>
              ลบ wave สุดท้าย
            </Button>
          </Space>
          <p className="muted">หลัง wave สุดท้าย ออเดอร์จะเป็น “ไม่พบคนขับ” และแจ้งเตือนทีมปฏิบัติการให้จัดคนขับเอง</p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">Dispatch score weights & Surge</div>
        <div className="panel-body">
          <Fields inline>
            {Object.keys(s.dispatchWeights).map((k) => (
              <Field key={k} label={k}>
                <InputNumber value={s.dispatchWeights[k]} step={0.1} decimalPlaces={2} min={0} max={10} onChange={(v) => setS({ ...s, dispatchWeights: { ...s.dispatchWeights, [k]: Number(v) } })} />
              </Field>
            ))}
            <Field label="Surge เปิด">
              <Switch value={s.surge.enabled} onChange={(v) => setS({ ...s, surge: { ...s.surge, enabled: v } })} />
            </Field>
            {num(['surge', 'maxMilli'], 'Surge สูงสุด', { suffix: '×', scale: 1000, decimals: 2 })}
            {num(['surge', 'cooldownSeconds'], 'Cooldown', { suffix: 'วินาที' })}
          </Fields>
          <Fields>
            <Field label='วันหยุด (JSON: [{"date":"2026-12-31","label":"สิ้นปี","milli":1200}])'>
              <Textarea value={JSON.stringify(s.holidays)} onChange={(v) => { try { setS({ ...s, holidays: JSON.parse(String(v)) }); } catch { /* typing */ } }} />
            </Field>
          </Fields>
        </div>
      </div>
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <div className="panel-body">
          <Space>
            <Input placeholder="เหตุผลการเปลี่ยนแปลง (บันทึกใน audit log)" style={{ width: 420 }} value={reason} onChange={(v) => setReason(String(v))} />
            <Button theme="primary" onClick={() => void save()}>
              บันทึก (มีผลทันที)
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );

  function setWave(i: number, key: string, v: number) {
    const waves = s.dispatchWaves.map((w: any, j: number) => (j === i ? { ...w, [key]: v } : w));
    setS({ ...s, dispatchWaves: waves });
  }
}
