import { VEHICLE_TYPES } from '@ship/shared';
import { useState } from 'react';
import { GeoJSON, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import { Button, Input, Select, Space, Switch, Table, Tag } from 'tdesign-react';
import { Field, Fields } from '../components/Field';
import { get, post, put } from '../lib/api';
import { vehicleName } from '../lib/format';
import { run, useAsync } from '../lib/useAsync';

type Pt = [number, number]; // [lat, lng]

function ClickCapture({ onClick }: { onClick: (p: Pt) => void }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export function ZonesPage({ isAdmin }: { isAdmin: boolean }) {
  const { data, reload } = useAsync(() => get('/ops/zones'));
  const [draft, setDraft] = useState<any>(null);
  const [points, setPoints] = useState<Pt[]>([]);

  const startNew = () => {
    setDraft({ code: '', name: '', nameEn: '', vehicleTypes: [...VEHICLE_TYPES], active: true, serviceHours: null });
    setPoints([]);
  };

  const edit = (z: any) => {
    const ring: [number, number][] = z.geojson.coordinates[0][0];
    setPoints(ring.slice(0, -1).map(([lng, lat]) => [lat, lng]));
    setDraft({ id: z.id, code: z.code, name: z.name, nameEn: z.name_en ?? '', vehicleTypes: z.vehicle_types, active: z.active, serviceHours: z.service_hours });
  };

  const save = async () => {
    if (points.length < 3) return;
    const ring = [...points, points[0]].map(([lat, lng]) => [lng, lat]);
    const body = { ...draft, polygon: [ring] };
    delete body.id;
    const ok = await run(() => (draft.id ? put(`/ops/zones/${draft.id}`, body) : post('/ops/zones', body)), 'บันทึกโซนแล้ว');
    if (ok) {
      setDraft(null);
      setPoints([]);
      void reload();
    }
  };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 420px' }}>
      <div className="panel zone-map">
        <MapContainer center={[13.79, 100.58]} zoom={11}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {(data ?? []).map((z: any) => (
            <GeoJSON key={z.id + (draft?.id === z.id ? '-editing' : '')} data={z.geojson} style={{ color: z.active ? '#0052D9' : '#A6A6A6', weight: 1.5, fillOpacity: draft?.id === z.id ? 0 : 0.06 }} />
          ))}
          {draft && points.length > 0 && <Polygon positions={points} pathOptions={{ color: '#E37318', weight: 2, dashArray: '4 4' }} />}
          {draft && <ClickCapture onClick={(p) => setPoints((ps) => [...ps, p])} />}
        </MapContainer>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span>พื้นที่ให้บริการ</span>
          {isAdmin && !draft && (
            <Button size="small" onClick={startNew}>
              สร้างโซนใหม่
            </Button>
          )}
        </div>
        <div className="panel-body">
          {draft ? (
            <Fields>
              <p className="muted" style={{ marginTop: 0 }}>
                คลิกบนแผนที่เพื่อวางจุดของ polygon ({points.length} จุด)
              </p>
              <Space style={{ marginBottom: 8 }}>
                <Button size="small" variant="outline" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
                  ลบจุดล่าสุด
                </Button>
                <Button size="small" variant="outline" onClick={() => setPoints([])}>
                  ล้าง
                </Button>
              </Space>
              <Field label="รหัส (A-Z, 0-9)">
                <Input value={draft.code} onChange={(v) => setDraft({ ...draft, code: String(v).toUpperCase() })} />
              </Field>
              <Field label="ชื่อ">
                <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              </Field>
              <Field label="ชื่ออังกฤษ">
                <Input value={draft.nameEn} onChange={(v) => setDraft({ ...draft, nameEn: v })} />
              </Field>
              <Field label="ประเภทรถที่ให้บริการ">
                <Select multiple value={draft.vehicleTypes} onChange={(v) => setDraft({ ...draft, vehicleTypes: v })} options={VEHICLE_TYPES.map((v) => ({ value: v, label: vehicleName(v) }))} />
              </Field>
              <Field label="เวลาให้บริการ (ว่าง = 24 ชม.)">
                <Space>
                  <Input placeholder="07:00" value={draft.serviceHours?.start ?? ''} onChange={(v) => setDraft({ ...draft, serviceHours: v ? { start: v, end: draft.serviceHours?.end ?? '22:00' } : null })} />
                  <Input placeholder="22:00" value={draft.serviceHours?.end ?? ''} onChange={(v) => setDraft({ ...draft, serviceHours: draft.serviceHours ? { ...draft.serviceHours, end: v } : null })} />
                </Space>
              </Field>
              <Field label="เปิดใช้งาน">
                <Switch value={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
              </Field>
              <Space>
                <Button theme="primary" disabled={points.length < 3 || !draft.code || !draft.name} onClick={() => void save()}>
                  บันทึก
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  ยกเลิก
                </Button>
              </Space>
            </Fields>
          ) : (
            <Table
              size="small"
              rowKey="id"
              data={data ?? []}
              hover={isAdmin}
              onRowClick={({ row }) => isAdmin && edit(row)}
              columns={[
                { colKey: 'code', title: 'รหัส', width: 110 },
                { colKey: 'name', title: 'ชื่อ' },
                { colKey: 'hours', title: 'เวลา', width: 100, cell: ({ row }) => (row.service_hours ? `${row.service_hours.start}-${row.service_hours.end}` : '24 ชม.') },
                { colKey: 'active', title: '', width: 70, cell: ({ row }) => (row.active ? <Tag size="small" theme="success" variant="light">เปิด</Tag> : <Tag size="small">ปิด</Tag>) },
              ]}
            />
          )}
          <p className="muted">แต่ละโซนกำหนดราคา (pricing rule ระดับโซน), GP, โปรโมชัน, เวลาให้บริการ และประเภทรถได้แยกกัน · ระบบเลือกโซนที่เล็กที่สุดที่ครอบคลุมจุดรับ</p>
        </div>
      </div>
    </div>
  );
}
