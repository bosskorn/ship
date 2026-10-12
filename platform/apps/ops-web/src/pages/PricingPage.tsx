import { PricingRuleInput, VEHICLE_TYPES } from '@ship/shared';
import { useState } from 'react';
import { Button, Dialog, Input, InputNumber, Select, Switch, Table, Tabs, Tag, Textarea } from 'tdesign-react';
import { Field, Fields } from '../components/Field';
import { get, post, put } from '../lib/api';
import { thb, time, vehicleName } from '../lib/format';
import { run, useAsync } from '../lib/useAsync';

const baht = (s: number) => s / 100;
const satang = (b: number | undefined | null) => Math.round((Number(b) || 0) * 100);

export function PricingPage({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <Tabs defaultValue="pricing">
          <Tabs.TabPanel value="pricing" label="ราคา (Pricing rules)">
            <PricingRules isAdmin={isAdmin} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="gp" label="GP / Commission">
            <CommissionRules isAdmin={isAdmin} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="surge" label="Surge">
            <Surge isAdmin={isAdmin} />
          </Tabs.TabPanel>
        </Tabs>
      </div>
    </div>
  );
}

function PricingRules({ isAdmin }: { isAdmin: boolean }) {
  const { data, reload } = useAsync(() => get('/ops/pricing-rules'));
  const zones = useAsync(() => get('/ops/zones'));
  const [edit, setEdit] = useState<any>(null);
  const [reason, setReason] = useState('');

  const save = async () => {
    const { id, zoneCode: _z, updatedAt: _u, ...rest } = edit;
    const body: PricingRuleInput = {
      ...rest,
      zoneId: rest.zoneId || null,
      timeMultipliers: typeof rest.timeMultipliers === 'string' ? JSON.parse(rest.timeMultipliers) : rest.timeMultipliers,
      specialServiceFees: typeof rest.specialServiceFees === 'string' ? JSON.parse(rest.specialServiceFees) : rest.specialServiceFees,
      effectiveFrom: rest.effectiveFrom ? new Date(rest.effectiveFrom).toISOString() : undefined,
      effectiveTo: rest.effectiveTo ? new Date(rest.effectiveTo).toISOString() : null,
    };
    const ok = await run(() => (id ? put(`/ops/pricing-rules/${id}`, { data: body, reason }) : post('/ops/pricing-rules', { data: body, reason })), 'บันทึกแล้ว (มีผลทันที ไม่ต้อง deploy)');
    if (ok) {
      setEdit(null);
      setReason('');
      void reload();
    }
  };

  const money = (key: string, label: string) => (
    <Field label={label}>
      <InputNumber value={baht(edit[key])} decimalPlaces={2} min={0} suffix="฿" onChange={(v) => setEdit({ ...edit, [key]: satang(v as number) })} />
    </Field>
  );

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="toolbar">
        {isAdmin && (
          <Button
            onClick={() =>
              setEdit({
                name: '',
                vehicleType: 'MOTORCYCLE',
                zoneId: null,
                baseFare: 3000,
                perKm: 650,
                includedKm: 0,
                minimumFare: 4500,
                vehicleFee: 0,
                additionalStopFee: 1500,
                waitingFeePerMin: 200,
                freeWaitingMin: 15,
                trafficFeePerMin: 0,
                specialServiceFees: {},
                timeMultipliers: [],
                allowBelowMargin: false,
                active: true,
              })
            }
          >
            เพิ่ม pricing rule
          </Button>
        )}
        <span className="muted">กฎที่ระบุโซนจะถูกใช้ก่อนกฎทั่วไป · ราคาทั้งหมดคำนวณที่ server เท่านั้น</span>
      </div>
      <Table
        size="small"
        rowKey="id"
        data={data ?? []}
        onRowClick={({ row }) => isAdmin && setEdit({ ...row, timeMultipliers: JSON.stringify(row.timeMultipliers, null, 1), specialServiceFees: JSON.stringify(row.specialServiceFees) })}
        hover={isAdmin}
        columns={[
          { colKey: 'name', title: 'ชื่อ' },
          { colKey: 'vehicleType', title: 'รถ', width: 90, cell: ({ row }) => vehicleName(row.vehicleType) },
          { colKey: 'zoneCode', title: 'โซน', width: 100, cell: ({ row }) => row.zoneCode ?? <span className="muted">ทั้งหมด</span> },
          { colKey: 'baseFare', title: 'ค่าเริ่มต้น', width: 90, align: 'right', cell: ({ row }) => thb(row.baseFare) },
          { colKey: 'perKm', title: '/กม.', width: 70, align: 'right', cell: ({ row }) => thb(row.perKm) },
          { colKey: 'minimumFare', title: 'ขั้นต่ำ', width: 80, align: 'right', cell: ({ row }) => thb(row.minimumFare) },
          { colKey: 'additionalStopFee', title: 'จุดเพิ่ม', width: 80, align: 'right', cell: ({ row }) => thb(row.additionalStopFee) },
          { colKey: 'waitingFeePerMin', title: 'รอ/นาที', width: 80, align: 'right', cell: ({ row }) => thb(row.waitingFeePerMin) },
          { colKey: 'timeMultipliers', title: 'ช่วงเวลา', width: 120, cell: ({ row }) => <span className="muted">{row.timeMultipliers.length} ช่วง (สูงสุด ×{Math.max(1, ...row.timeMultipliers.map((t: any) => t.milli / 1000))})</span> },
          { colKey: 'active', title: 'ใช้งาน', width: 70, cell: ({ row }) => (row.active ? <Tag size="small" theme="success" variant="light">ใช้งาน</Tag> : <Tag size="small">ปิด</Tag>) },
        ]}
      />
      <Dialog visible={!!edit} width={720} header={edit?.id ? 'แก้ไข pricing rule' : 'เพิ่ม pricing rule'} onClose={() => setEdit(null)} onConfirm={() => void save()}>
        {edit && (
          <Fields inline>
            <Field label="ชื่อ" style={{ width: '100%' }}>
              <Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
            </Field>
            <Field label="ประเภทรถ">
              <Select value={edit.vehicleType} onChange={(v) => setEdit({ ...edit, vehicleType: v })} options={VEHICLE_TYPES.map((v) => ({ value: v, label: vehicleName(v) }))} />
            </Field>
            <Field label="โซน">
              <Select clearable value={edit.zoneId ?? undefined} onChange={(v) => setEdit({ ...edit, zoneId: v ?? null })} options={(zones.data ?? []).map((z: any) => ({ value: z.id, label: `${z.code} ${z.name}` }))} placeholder="ทุกโซน" />
            </Field>
            {money('baseFare', 'ค่าเริ่มต้น')}
            {money('perKm', 'ต่อ กม.')}
            <Field label="กม. รวมในค่าเริ่มต้น">
              <InputNumber value={edit.includedKm} decimalPlaces={1} min={0} onChange={(v) => setEdit({ ...edit, includedKm: Number(v) })} />
            </Field>
            {money('minimumFare', 'ค่าบริการขั้นต่ำ')}
            {money('vehicleFee', 'ค่ารถ (vehicle fee)')}
            {money('additionalStopFee', 'จุดส่งเพิ่ม/จุด')}
            {money('waitingFeePerMin', 'ค่ารอ/นาที')}
            <Field label="รอฟรี (นาที)">
              <InputNumber value={edit.freeWaitingMin} min={0} onChange={(v) => setEdit({ ...edit, freeWaitingMin: Number(v) })} />
            </Field>
            {money('trafficFeePerMin', 'Traffic/นาทีที่ช้ากว่าปกติ')}
            <Field label="Special services (satang JSON)" style={{ width: '100%' }}>
              <Textarea value={typeof edit.specialServiceFees === 'string' ? edit.specialServiceFees : JSON.stringify(edit.specialServiceFees)} onChange={(v) => setEdit({ ...edit, specialServiceFees: v })} />
            </Field>
            <Field label="Peak / Night / ช่วงเวลา (JSON: label, days 0-6, start, end, milli)" style={{ width: '100%' }}>
              <Textarea autosize={{ minRows: 3 }} value={typeof edit.timeMultipliers === 'string' ? edit.timeMultipliers : JSON.stringify(edit.timeMultipliers)} onChange={(v) => setEdit({ ...edit, timeMultipliers: v })} />
            </Field>
            <Field label="ยอมให้ต่ำกว่า minimum margin (override)">
              <Switch value={edit.allowBelowMargin} onChange={(v) => setEdit({ ...edit, allowBelowMargin: v })} />
            </Field>
            <Field label="ใช้งาน">
              <Switch value={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
            </Field>
            <Field label="เหตุผลการเปลี่ยนแปลง (audit)" style={{ width: '100%' }}>
              <Input value={reason} onChange={(v) => setReason(String(v))} />
            </Field>
          </Fields>
        )}
      </Dialog>
    </div>
  );
}

function CommissionRules({ isAdmin }: { isAdmin: boolean }) {
  const { data, reload } = useAsync(() => get('/ops/commission-rules'));
  const zones = useAsync(() => get('/ops/zones'));
  const [edit, setEdit] = useState<any>(null);
  const [reason, setReason] = useState('');

  const save = async () => {
    const body = {
      name: edit.name,
      driverId: edit.driver_id || null,
      tier: edit.tier || null,
      vehicleType: edit.vehicle_type || null,
      zoneId: edit.zone_id || null,
      campaign: edit.campaign || null,
      rateBp: Math.round(Number(edit.ratePct) * 100),
      priority: Number(edit.priority) || 0,
      validFrom: edit.valid_from ? new Date(edit.valid_from).toISOString() : null,
      validTo: edit.valid_to ? new Date(edit.valid_to).toISOString() : null,
      active: edit.active,
    };
    const ok = await run(() => (edit.id ? put(`/ops/commission-rules/${edit.id}`, { data: body, reason }) : post('/ops/commission-rules', { data: body, reason })), 'บันทึกแล้ว');
    if (ok) {
      setEdit(null);
      setReason('');
      void reload();
    }
  };

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="toolbar">
        {isAdmin && <Button onClick={() => setEdit({ name: '', ratePct: 8, priority: 0, active: true })}>เพิ่มกฎ GP</Button>}
        <span className="muted">เลือกกฎที่ priority สูงสุด หากเท่ากันใช้กฎที่เฉพาะเจาะจงกว่า (คนขับ › แคมเปญ › โซน › รถ › tier) · ค่าเริ่มต้น 8% เมื่อไม่มีกฎ</span>
      </div>
      <Table
        size="small"
        rowKey="id"
        data={data ?? []}
        hover={isAdmin}
        onRowClick={({ row }) => isAdmin && setEdit({ ...row, ratePct: row.rate_bp / 100 })}
        columns={[
          { colKey: 'name', title: 'ชื่อ' },
          { colKey: 'rate_bp', title: 'GP', width: 70, cell: ({ row }) => `${row.rate_bp / 100}%` },
          { colKey: 'tier', title: 'Tier', width: 90 },
          { colKey: 'vehicle_type', title: 'รถ', width: 90, cell: ({ row }) => (row.vehicle_type ? vehicleName(row.vehicle_type) : '') },
          { colKey: 'zone_code', title: 'โซน', width: 90 },
          { colKey: 'driver_name', title: 'คนขับ', width: 120 },
          { colKey: 'campaign', title: 'แคมเปญ', width: 100 },
          { colKey: 'priority', title: 'Priority', width: 70 },
          { colKey: 'valid', title: 'ช่วงเวลา', width: 200, cell: ({ row }) => (row.valid_from || row.valid_to ? `${time(row.valid_from)} – ${time(row.valid_to)}` : '') },
          { colKey: 'active', title: '', width: 60, cell: ({ row }) => (row.active ? <Tag size="small" theme="success" variant="light">ใช้งาน</Tag> : <Tag size="small">ปิด</Tag>) },
        ]}
      />
      <Dialog visible={!!edit} width={640} header="กฎ GP" onClose={() => setEdit(null)} onConfirm={() => void save()}>
        {edit && (
          <Fields inline>
            <Field label="ชื่อ" style={{ width: '100%' }}>
              <Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
            </Field>
            <Field label="GP (%)">
              <InputNumber value={edit.ratePct} min={0} max={50} decimalPlaces={2} onChange={(v) => setEdit({ ...edit, ratePct: v })} />
            </Field>
            <Field label="Priority">
              <InputNumber value={edit.priority} min={0} onChange={(v) => setEdit({ ...edit, priority: v })} />
            </Field>
            <Field label="Tier">
              <Select clearable value={edit.tier ?? undefined} onChange={(v) => setEdit({ ...edit, tier: v ?? null })} options={['NEW', 'STANDARD', 'SILVER', 'GOLD', 'PRO'].map((t) => ({ value: t, label: t }))} />
            </Field>
            <Field label="รถ">
              <Select clearable value={edit.vehicle_type ?? undefined} onChange={(v) => setEdit({ ...edit, vehicle_type: v ?? null })} options={VEHICLE_TYPES.map((v) => ({ value: v, label: vehicleName(v) }))} />
            </Field>
            <Field label="โซน">
              <Select clearable value={edit.zone_id ?? undefined} onChange={(v) => setEdit({ ...edit, zone_id: v ?? null })} options={(zones.data ?? []).map((z: any) => ({ value: z.id, label: z.code }))} />
            </Field>
            <Field label="Driver ID">
              <Input value={edit.driver_id ?? ''} onChange={(v) => setEdit({ ...edit, driver_id: v })} />
            </Field>
            <Field label="แคมเปญ">
              <Input value={edit.campaign ?? ''} onChange={(v) => setEdit({ ...edit, campaign: v })} />
            </Field>
            <Field label="เริ่ม (ISO)">
              <Input value={edit.valid_from ?? ''} placeholder="2026-11-01T00:00:00+07:00" onChange={(v) => setEdit({ ...edit, valid_from: v })} />
            </Field>
            <Field label="สิ้นสุด (ISO)">
              <Input value={edit.valid_to ?? ''} onChange={(v) => setEdit({ ...edit, valid_to: v })} />
            </Field>
            <Field label="ใช้งาน">
              <Switch value={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
            </Field>
            <Field label="เหตุผล (audit)" style={{ width: '100%' }}>
              <Input value={reason} onChange={(v) => setReason(String(v))} />
            </Field>
          </Fields>
        )}
      </Dialog>
    </div>
  );
}

function Surge({ isAdmin }: { isAdmin: boolean }) {
  const { data, reload } = useAsync(() => get('/ops/surge'), [], 30_000);
  const history = useAsync(() => get('/ops/surge/history'), [], 30_000);
  const [edit, setEdit] = useState<any>(null);

  const save = async () => {
    const ok = await run(
      () => post('/ops/surge/override', { zoneId: edit.zone_id, vehicleType: edit.vehicle_type, milli: Math.round(Number(edit.mult) * 1000), untilMinutes: Number(edit.untilMinutes) || null, reason: edit.reason }),
      'ตั้งค่า surge แล้ว',
    );
    if (ok) {
      setEdit(null);
      void reload();
      void history.reload();
    }
  };

  return (
    <div style={{ paddingTop: 12, display: 'grid', gap: 12 }}>
      <Table
        size="small"
        rowKey="zone_id"
        data={data ?? []}
        columns={[
          { colKey: 'zone', title: 'โซน', cell: ({ row }) => `${row.zone_code} ${row.zone_name}` },
          { colKey: 'vehicle_type', title: 'รถ', width: 90, cell: ({ row }) => vehicleName(row.vehicle_type) },
          { colKey: 'demand', title: 'Demand', width: 80 },
          { colKey: 'supply', title: 'Supply', width: 80 },
          { colKey: 'milli', title: 'Surge', width: 80, cell: ({ row }) => <span className={row.milli > 1000 ? 'bad' : ''}>×{(row.milli / 1000).toFixed(2)}</span> },
          { colKey: 'manual', title: 'Manual', width: 140, cell: ({ row }) => (row.manual ? `ถึง ${time(row.manual_until)}` : '') },
          { colKey: 'changed_at', title: 'เปลี่ยนล่าสุด', width: 130, cell: ({ row }) => time(row.changed_at) },
          { colKey: 'op', title: '', width: 80, cell: ({ row }) => isAdmin && <Button size="small" variant="text" onClick={() => setEdit({ ...row, mult: row.milli / 1000, untilMinutes: 60, reason: '' })}>Override</Button> },
        ]}
      />
      <h4 style={{ margin: 0 }}>ประวัติ surge</h4>
      <Table
        size="small"
        rowKey="id"
        data={history.data ?? []}
        maxHeight={260}
        columns={[
          { colKey: 'created_at', title: 'เวลา', width: 130, cell: ({ row }) => time(row.created_at) },
          { colKey: 'vehicle_type', title: 'รถ', width: 90 },
          { colKey: 'change', title: 'เปลี่ยน', cell: ({ row }) => `×${row.from_milli / 1000} → ×${row.to_milli / 1000}` },
          { colKey: 'ds', title: 'Demand/Supply', cell: ({ row }) => `${row.demand}/${row.supply}` },
          { colKey: 'source', title: 'ที่มา', width: 90 },
        ]}
      />
      <Dialog visible={!!edit} header="Manual surge override" onClose={() => setEdit(null)} onConfirm={() => void save()} confirmBtn={{ content: 'บันทึก', disabled: !edit?.reason || edit.reason.length < 3 }}>
        {edit && (
          <Fields>
            <Field label="Multiplier (1.0 – 5.0)">
              <InputNumber value={edit.mult} step={0.05} min={1} max={5} decimalPlaces={2} onChange={(v) => setEdit({ ...edit, mult: v })} />
            </Field>
            <Field label="นาน (นาที)">
              <InputNumber value={edit.untilMinutes} min={5} max={1440} onChange={(v) => setEdit({ ...edit, untilMinutes: v })} />
            </Field>
            <Field label="เหตุผล">
              <Input value={edit.reason} onChange={(v) => setEdit({ ...edit, reason: v })} />
            </Field>
          </Fields>
        )}
      </Dialog>
    </div>
  );
}
