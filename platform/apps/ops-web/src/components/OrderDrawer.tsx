import { numericToSatang, PAYMENT_METHOD_TH, PaymentMethod } from '@ship/shared';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { Button, Dialog, Drawer, Image, Space, Table, Tabs, Tag, Textarea } from 'tdesign-react';
import { get, post } from '../lib/api';
import { km, mins, PRESENCE_TH, statusTheme, statusText, thb, time, vehicleName } from '../lib/format';
import { run } from '../lib/useAsync';

const BREAKDOWN_TH: Record<string, string> = {
  baseFare: 'ค่าเริ่มต้น',
  distanceFee: 'ค่าระยะทาง',
  vehicleFee: 'ค่ารถ',
  additionalStopsFee: 'จุดส่งเพิ่ม',
  specialServicesFee: 'บริการพิเศษ',
  tollParking: 'ทางด่วน/ที่จอด',
  demandAdjustment: 'ปรับตามความต้องการ/ช่วงเวลา',
  trafficAdjustment: 'ปรับตามการจราจร',
  minimumFareTopUp: 'ปรับขึ้นเป็นค่าขั้นต่ำ',
  serviceFee: 'ค่าบริการแพลตฟอร์ม',
  subtotal: 'รวมก่อนส่วนลด',
  promotionDiscount: 'ส่วนลดโปรโมชัน',
  total: 'ลูกค้าจ่าย',
};

const EVENT_TH: Record<string, string> = {
  ORDER_CREATED: 'สร้างออเดอร์',
  STATUS_CHANGED: 'เปลี่ยนสถานะ',
  DISPATCH_WAVE: 'ส่งงานให้คนขับ (wave)',
  DISPATCH_WAVE_EMPTY: 'ไม่พบคนขับในรัศมี',
  PAYMENT_CONFIRMED: 'ชำระเงินสำเร็จ',
  RATED: 'ลูกค้าให้คะแนน',
};

export function OrderDrawer({ orderId, onClose, onChanged }: { orderId: string | null; onClose: () => void; onChanged?: () => void }) {
  const [o, setO] = useState<any>(null);
  const [path, setPath] = useState<any[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<null | 'cancel' | 'redispatch'>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    if (!orderId) return;
    const [detail, p] = await Promise.all([get(`/ops/orders/${orderId}`), get(`/ops/orders/${orderId}/path`)]);
    setO(detail);
    setPath(p);
  };

  useEffect(() => {
    setO(null);
    setPath([]);
    if (orderId) void run(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const canAssign = o && ['SEARCHING_DRIVER', 'NO_DRIVER', 'SCHEDULED'].includes(o.status);
  const canRedispatch = o && o.status === 'NO_DRIVER';
  const canCancel = o && !['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(o.status);

  const submitReason = async () => {
    if (!o || !reasonDialog) return;
    const ok = await run(() => post(`/ops/orders/${o.id}/${reasonDialog === 'cancel' ? 'cancel' : 'redispatch'}`, { reason }), 'บันทึกแล้ว');
    if (ok) {
      setReasonDialog(null);
      setReason('');
      await refresh();
    }
  };

  return (
    <Drawer
      visible={!!orderId}
      onClose={onClose}
      size="720px"
      header={
        o ? (
          <Space align="center">
            <span className="mono">{o.orderNo}</span>
            <Tag theme={statusTheme(o.status)} variant="light">
              {statusText(o.status)}
            </Tag>
            <span className="muted">{vehicleName(o.vehicleType)}</span>
          </Space>
        ) : (
          'ออเดอร์'
        )
      }
      footer={
        <Space>
          <Button disabled={!canAssign} theme="primary" onClick={() => setAssignOpen(true)}>
            จัดคนขับเอง
          </Button>
          <Button disabled={!canRedispatch} variant="outline" onClick={() => setReasonDialog('redispatch')}>
            หาคนขับใหม่
          </Button>
          <Button disabled={!canCancel} theme="danger" variant="outline" onClick={() => setReasonDialog('cancel')}>
            ยกเลิกออเดอร์
          </Button>
        </Space>
      }
    >
      {o && (
        <Tabs defaultValue="overview">
          <Tabs.TabPanel value="overview" label="ภาพรวม">
            <Overview o={o} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="timeline" label={`Timeline (${o.timeline.length})`}>
            <Timeline items={o.timeline} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="dispatch" label={`Dispatch (${o.offers.length})`}>
            <DispatchTab o={o} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="pod" label="POD">
            <PodTab o={o} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="map" label="เส้นทาง">
            <PathMap o={o} path={path} />
          </Tabs.TabPanel>
        </Tabs>
      )}
      {o && <AssignDialog open={assignOpen} orderId={o.id} onClose={() => setAssignOpen(false)} onDone={refresh} />}
      <Dialog
        visible={!!reasonDialog}
        header={reasonDialog === 'cancel' ? 'ยกเลิกออเดอร์' : 'เริ่มหาคนขับใหม่'}
        onClose={() => setReasonDialog(null)}
        onConfirm={() => void submitReason()}
        confirmBtn={{ content: 'ยืนยัน', disabled: reason.trim().length < 3 }}
      >
        <p className="muted">ระบุเหตุผล (บันทึกใน Audit log)</p>
        <Textarea value={reason} onChange={(v) => setReason(String(v))} autosize={{ minRows: 3 }} />
      </Dialog>
    </Drawer>
  );
}

function Overview({ o }: { o: any }) {
  const e = o.economics;
  return (
    <div style={{ display: 'grid', gap: 16, paddingTop: 12 }}>
      <section>
        <h4 style={{ margin: '0 0 8px' }}>จุดรับ-ส่ง</h4>
        <Table
          size="small"
          rowKey="id"
          data={o.stops}
          columns={[
            { colKey: 'seq', title: '#', width: 40 },
            { colKey: 'type', title: 'ประเภท', width: 70, cell: ({ row }) => (row.type === 'PICKUP' ? 'รับ' : 'ส่ง') },
            {
              colKey: 'address',
              title: 'ที่อยู่',
              cell: ({ row }) => (
                <div>
                  {row.address}
                  {(row.building || row.floor || row.room) && (
                    <div className="muted">
                      {[row.building, row.floor && `ชั้น ${row.floor}`, row.room && `ห้อง ${row.room}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {row.note && <div className="muted">หมายเหตุ: {row.note}</div>}
                </div>
              ),
            },
            { colKey: 'contact', title: 'ผู้ติดต่อ', width: 140, cell: ({ row }) => `${row.contactName} ${row.contactPhone}` },
            { colKey: 'status', title: 'สถานะ', width: 110 },
          ]}
        />
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">ลูกค้า / คนขับ</div>
          <dl className="kv panel-body">
            <dt>ลูกค้า</dt>
            <dd>
              {o.customer?.name ?? '–'} {o.customer?.phone}
            </dd>
            <dt>คนขับ</dt>
            <dd>{o.driver ? `${o.driver.name} · ${o.driver.vehicle.plateNumber} ${o.driver.vehicle.plateProvince}` : '–'}</dd>
            <dt>ชำระเงิน</dt>
            <dd>
              {PAYMENT_METHOD_TH[o.paymentMethod as PaymentMethod]} · {o.payments[0]?.status ?? '–'}
            </dd>
            <dt>ระยะทาง</dt>
            <dd>
              {km(o.distanceM)} · ~{mins(o.durationS)}
            </dd>
            <dt>สินค้า</dt>
            <dd>
              {String(o.parcel.category)} · {String(o.parcel.weightKg)} กก.
              {o.parcel.fragile ? ' · แตกง่าย' : ''}
              {o.parcel.highValue ? ' · มูลค่าสูง' : ''}
            </dd>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">Unit economics</div>
          <dl className="kv panel-body num">
            <dt>ลูกค้าจ่าย</dt>
            <dd>{thb(e.price)}</dd>
            <dt>ค่ารอบคนขับ</dt>
            <dd>{thb(e.driverGross)}</dd>
            <dt>GP</dt>
            <dd>
              {thb(e.commission)} {e.commissionRateBp !== null && <span className="muted">({e.commissionRateBp / 100}%)</span>}
            </dd>
            <dt>โบนัส</dt>
            <dd>{thb(e.driverBonus)}</dd>
            <dt>คนขับได้รับ</dt>
            <dd>{thb(e.driverNet)}</dd>
            <dt>Contribution margin</dt>
            <dd className={e.contributionMargin !== null && e.contributionMargin < 0 ? 'bad' : ''}>
              {e.contributionMargin === null ? <span className="muted">คาดการณ์ {thb(e.quoteMargin?.contributionMargin)}</span> : thb(e.contributionMargin)}
            </dd>
            <dt>Surge</dt>
            <dd>×{((e.surgeMilli ?? 1000) / 1000).toFixed(2)}</dd>
          </dl>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">รายละเอียดราคา</div>
        <dl className="kv panel-body num">
          {Object.keys(BREAKDOWN_TH)
            .filter((k) => (o.breakdown as Record<string, number>)[k])
            .map((k) => [
              <dt key={`${k}-k`}>{BREAKDOWN_TH[k]}</dt>,
              <dd key={`${k}-v`}>{k === 'promotionDiscount' ? '−' : ''}{thb(o.breakdown[k])}</dd>,
            ])}
        </dl>
      </section>
    </div>
  );
}

function Timeline({ items }: { items: any[] }) {
  return (
    <ul className="timeline" style={{ paddingTop: 12 }}>
      {items.map((t) => (
        <li key={t.id} className={t.toStatus ? '' : 'event'}>
          <span className="muted num">{time(t.at).slice(6)}</span>
          <span className="rail" />
          <div>
            <div>
              {t.toStatus ? (
                <>
                  <Tag size="small" theme={statusTheme(t.toStatus)} variant="light">
                    {statusText(t.toStatus)}
                  </Tag>{' '}
                </>
              ) : (
                <strong>{EVENT_TH[t.type] ?? t.type} </strong>
              )}
              <span className="muted">
                {t.actorType}
                {t.data?.distanceM !== undefined ? ` · ห่างจุดหมาย ${t.data.distanceM} ม.` : ''}
                {t.data?.overrideReason ? ` · override: ${t.data.overrideReason}` : ''}
                {t.data?.reason ? ` · ${t.data.reason}` : ''}
                {t.data?.wave !== undefined ? ` · wave ${t.data.wave + 1} รัศมี ${km(t.data.radiusM)}` : ''}
                {t.data?.offers ? ` · ${t.data.offers.length} คน` : ''}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DispatchTab({ o }: { o: any }) {
  return (
    <div style={{ paddingTop: 12, display: 'grid', gap: 12 }}>
      <Table
        size="small"
        rowKey="id"
        data={o.offers}
        columns={[
          { colKey: 'wave', title: 'Wave', width: 56, cell: ({ row }) => row.wave + 1 },
          { colKey: 'driver_name', title: 'คนขับ' },
          { colKey: 'status', title: 'ผล', width: 90 },
          { colKey: 'score', title: 'Score', width: 70 },
          { colKey: 'distance_to_pickup_m', title: 'ถึงจุดรับ', width: 80, cell: ({ row }) => km(row.distance_to_pickup_m) },
          { colKey: 'eta_to_pickup_s', title: 'ETA', width: 70, cell: ({ row }) => mins(row.eta_to_pickup_s) },
          { colKey: 'net', title: 'คนขับได้', width: 80, cell: ({ row }) => thb(numericToSatang(row.net)) },
          { colKey: 'decline_reason', title: 'เหตุผล' },
        ]}
      />
      <Table
        size="small"
        rowKey="id"
        data={o.assignments}
        columns={[
          { colKey: 'driver_name', title: 'Assignment' },
          { colKey: 'method', title: 'วิธี', width: 80 },
          { colKey: 'assigned_at', title: 'เวลา', width: 130, cell: ({ row }) => time(row.assigned_at) },
          { colKey: 'planned_dead_mileage_m', title: 'Dead mileage (แผน/จริง)', cell: ({ row }) => `${km(row.planned_dead_mileage_m)} / ${km(row.actual_dead_mileage_m)}` },
          { colKey: 'loaded_mileage_m', title: 'Loaded', width: 80, cell: ({ row }) => km(row.loaded_mileage_m) },
          { colKey: 'end_reason', title: 'สิ้นสุด' },
        ]}
      />
    </div>
  );
}

function PodTab({ o }: { o: any }) {
  if (!o.pod.length) return <p className="muted">ยังไม่มีหลักฐาน</p>;
  return (
    <div style={{ display: 'grid', gap: 12, paddingTop: 12 }}>
      {o.pod.map((p: any) => (
        <div className="panel" key={p.id}>
          <div className="panel-head">
            {p.kind === 'PICKUP' ? 'หลักฐานการรับสินค้า' : 'หลักฐานการส่ง (POD)'} · {time(p.recorded_at)}
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
            <Space>
              <Tag theme={p.otp_verified ? 'success' : 'default'} variant="light">
                OTP {p.otp_verified ? '✓' : '–'}
              </Tag>
              <Tag theme={p.qr_verified ? 'success' : 'default'} variant="light">
                QR {p.qr_verified ? '✓' : '–'}
              </Tag>
              <Tag theme={p.distance_from_stop_m > 300 ? 'danger' : 'default'} variant="light">
                ห่างจุด {p.distance_from_stop_m} ม.
              </Tag>
              {p.recipient_name && <span>ผู้รับ: {p.recipient_name}</span>}
            </Space>
            {p.override_reason && <div className="bad">Override: {p.override_reason}</div>}
            <Space>
              {p.photoUrls.map((u: string) => (
                <Image key={u} src={u} className="doc-thumb" fit="cover" />
              ))}
              {p.signatureUrl && <Image src={p.signatureUrl} className="doc-thumb" fit="contain" />}
            </Space>
            <span className="muted">ข้อมูล POD แก้ไขย้อนหลังไม่ได้ · การแก้ไขโดยผู้ดูแลจะถูกบันทึกเป็น amendment + audit</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PathMap({ o, path }: { o: any; path: any[] }) {
  const center: [number, number] = [o.stops[0].location.lat, o.stops[0].location.lng];
  return (
    <div style={{ height: 460, marginTop: 12 }} className="zone-map">
      <MapContainer center={center} zoom={12}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {path.length > 1 && <Polyline positions={path.map((p) => [Number(p.lat), Number(p.lng)] as [number, number])} pathOptions={{ color: '#0052D9', weight: 3 }} />}
        {o.stops.map((s: any) => (
          <CircleMarker key={s.id} center={[s.location.lat, s.location.lng]} radius={7} pathOptions={{ color: '#1F2329', weight: 1.5, fillOpacity: 1, fillColor: s.type === 'PICKUP' ? '#2BA471' : '#E37318' }}>
            <Tooltip>
              {s.seq}. {s.address}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="muted">GPS {path.length} จุด</p>
    </div>
  );
}

function AssignDialog({ open, orderId, onClose, onDone }: { open: boolean; orderId: string; onClose: () => void; onDone: () => void }) {
  const [cands, setCands] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setCands(null);
    setSelected(null);
    void run(async () => setCands(await get(`/ops/orders/${orderId}/candidates`)));
  }, [open, orderId]);

  const confirm = async () => {
    const ok = await run(() => post(`/ops/orders/${orderId}/assign`, { driverId: selected, reason }), 'จัดคนขับแล้ว');
    if (ok) {
      onClose();
      onDone();
    }
  };

  return (
    <Dialog
      visible={open}
      width={860}
      header="จัดคนขับเอง (Manual dispatch)"
      onClose={onClose}
      onConfirm={() => void confirm()}
      confirmBtn={{ content: 'Assign', disabled: !selected || reason.trim().length < 3 }}
    >
      <Table
        size="small"
        rowKey="driverId"
        loading={!cands}
        data={cands ?? []}
        maxHeight={360}
        selectedRowKeys={selected ? [selected] : []}
        onSelectChange={(keys) => setSelected((keys[0] as string) ?? null)}
        columns={[
          { colKey: 'row-select', type: 'single', width: 40, checkProps: ({ row }) => ({ disabled: row.presence !== 'ONLINE' }) },
          { colKey: 'name', title: 'คนขับ' },
          { colKey: 'presence', title: 'สถานะ', width: 80, cell: ({ row }) => PRESENCE_TH[row.presence] },
          { colKey: 'distanceToPickupM', title: 'ถึงจุดรับ', width: 90, cell: ({ row }) => km(row.distanceToPickupM) },
          { colKey: 'etaToPickupS', title: 'ETA', width: 70, cell: ({ row }) => mins(row.etaToPickupS) },
          { colKey: 'acceptance', title: 'รับงาน', width: 70, cell: ({ row }) => `${Math.round(row.score.acceptanceRate * 100)}%` },
          { colKey: 'tier', title: 'Tier', width: 90 },
          { colKey: 'risk', title: 'Risk', width: 60, cell: ({ row }) => <span className={row.riskScore >= 60 ? 'bad' : ''}>{row.riskScore}</span> },
          { colKey: 'score', title: 'Score', width: 70, cell: ({ row }) => row.score.total.toFixed(2) },
        ]}
      />
      <p className="muted" style={{ marginBottom: 4 }}>
        เหตุผล (บังคับ บันทึกใน Audit log)
      </p>
      <Textarea value={reason} onChange={(v) => setReason(String(v))} placeholder="เช่น ไม่มีคนขับรับงานในพื้นที่" />
    </Dialog>
  );
}
