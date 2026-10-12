import { WsEvent } from '@ship/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { MessagePlugin, Tag } from 'tdesign-react';
import { OrderDrawer } from '../components/OrderDrawer';
import { get } from '../lib/api';
import { PRESENCE_COLOR, PRESENCE_TH, shortTime, statusTheme, statusText, vehicleName } from '../lib/format';
import { opsSocket } from '../lib/socket';
import { useAsync } from '../lib/useAsync';

type Bucket = 'all' | 'waiting' | 'noDriver' | 'latePickup' | 'lateDelivery' | 'problem';

const BKK: [number, number] = [13.79, 100.58];

export function LivePage() {
  const { data, reload, setData } = useAsync(() => get('/ops/live'), [], 15_000);
  const [bucket, setBucket] = useState<Bucket>('all');
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const reloadTimer = useRef<number | null>(null);

  useEffect(() => {
    const s = opsSocket();
    const scheduleReload = () => {
      if (reloadTimer.current) return;
      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null;
        void reload();
      }, 800);
    };
    const onLoc = (p: any) =>
      setData((d: any) => {
        if (!d) return d;
        const idx = d.drivers.findIndex((x: any) => x.id === p.driverId);
        if (idx < 0) {
          scheduleReload();
          return d;
        }
        const drivers = d.drivers.slice();
        drivers[idx] = { ...drivers[idx], lat: p.lat, lng: p.lng, heading: p.heading, presence: p.presence ?? drivers[idx].presence };
        return { ...d, drivers };
      });
    const onAlert = (a: any) => {
      setAlerts((prev) => [a, ...prev].slice(0, 50));
      if (a.kind === 'NO_DRIVER') void MessagePlugin.warning(a.message);
      scheduleReload();
    };
    s.on(WsEvent.OPS_DRIVER_LOCATION, onLoc);
    s.on(WsEvent.OPS_ORDER_UPDATED, scheduleReload);
    s.on(WsEvent.OPS_ALERT, onAlert);
    return () => {
      s.off(WsEvent.OPS_DRIVER_LOCATION, onLoc);
      s.off(WsEvent.OPS_ORDER_UPDATED, scheduleReload);
      s.off(WsEvent.OPS_ALERT, onAlert);
    };
  }, [reload, setData]);

  const orders = useMemo(() => {
    const all: any[] = data?.orders ?? [];
    switch (bucket) {
      case 'waiting':
        return all.filter((o) => o.status === 'SEARCHING_DRIVER');
      case 'noDriver':
        return all.filter((o) => o.status === 'NO_DRIVER');
      case 'latePickup':
        return all.filter((o) => o.late_pickup);
      case 'lateDelivery':
        return all.filter((o) => o.late_delivery);
      case 'problem':
        return all.filter((o) => o.problem);
      default:
        return all;
    }
  }, [data, bucket]);

  const c = data?.counts ?? {};
  const counters: { key: Bucket | null; label: string; value: number; tone?: string }[] = [
    { key: 'waiting', label: 'รอคนขับ', value: c.waiting ?? 0, tone: c.waiting ? 'warn' : '' },
    { key: 'noDriver', label: 'ไม่พบคนขับ', value: c.noDriver ?? 0, tone: c.noDriver ? 'bad' : '' },
    { key: 'latePickup', label: 'รับของล่าช้า', value: c.latePickup ?? 0, tone: c.latePickup ? 'bad' : '' },
    { key: 'lateDelivery', label: 'ส่งล่าช้า', value: c.lateDelivery ?? 0, tone: c.lateDelivery ? 'bad' : '' },
    { key: null, label: 'ยกเลิกวันนี้', value: c.cancelledToday ?? 0 },
    { key: null, label: 'สำเร็จวันนี้', value: c.completedToday ?? 0, tone: 'good' },
  ];

  return (
    <div className="live">
      <div className="live-map panel">
        <MapContainer center={BKK} zoom={12} preferCanvas>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {orders.map((o) => (
            <Polyline
              key={`l-${o.id}`}
              positions={[
                [o.pickup_lat, o.pickup_lng],
                [o.dropoff_lat, o.dropoff_lng],
              ]}
              pathOptions={{ color: o.problem ? '#D54941' : '#8B929C', weight: 1, dashArray: '4 4' }}
            />
          ))}
          {orders.map((o) => (
            <CircleMarker
              key={o.id}
              center={[o.pickup_lat, o.pickup_lng]}
              radius={7}
              eventHandlers={{ click: () => setOpenOrder(o.id) }}
              pathOptions={{
                color: '#1F2329',
                weight: 1.5,
                fillOpacity: 1,
                fillColor: o.problem ? '#D54941' : o.driver_id ? '#0052D9' : '#E37318',
              }}
            >
              <Tooltip>
                {o.order_no} · {statusText(o.status)}
                <br />
                {o.pickup_address}
              </Tooltip>
            </CircleMarker>
          ))}
          {(data?.drivers ?? []).map((d: any) => (
            <CircleMarker
              key={d.id}
              center={[d.lat, d.lng]}
              radius={5}
              pathOptions={{ color: '#fff', weight: 1.5, fillOpacity: 1, fillColor: PRESENCE_COLOR[d.presence] }}
              eventHandlers={{ click: () => d.order_id && setOpenOrder(d.order_id) }}
            >
              <Tooltip>
                {d.name} · {vehicleName(d.vehicle_type)} {d.plate_number}
                <br />
                {PRESENCE_TH[d.presence]} {d.risk_score > 0 ? `· risk ${d.risk_score}` : ''}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
        <div className="legend">
          <span>
            <i className="dot" style={{ background: PRESENCE_COLOR.ONLINE }} />
            ว่าง {c.onlineDrivers ?? 0}
          </span>
          <span>
            <i className="dot" style={{ background: PRESENCE_COLOR.BUSY }} />
            มีงาน {c.busyDrivers ?? 0}
          </span>
          <span>
            <i className="dot" style={{ background: PRESENCE_COLOR.OFFLINE }} />
            ออฟไลน์ล่าสุด
          </span>
          <span>
            <i className="dot" style={{ background: '#E37318', border: '1px solid #1F2329' }} />
            รอคนขับ
          </span>
          <span>
            <i className="dot" style={{ background: '#D54941', border: '1px solid #1F2329' }} />
            มีปัญหา
          </span>
        </div>
      </div>

      <div className="live-side">
        <div className="counters">
          {counters.map((k) => (
            <button
              key={k.label}
              className={`counter ${k.tone ?? ''} ${k.key && bucket === k.key ? 'active' : ''}`}
              onClick={() => k.key && setBucket(bucket === k.key ? 'all' : k.key)}
            >
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
            </button>
          ))}
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="panel-head">
            <span>
              ออเดอร์กำลังดำเนินการ ({orders.length}){bucket !== 'all' && <span className="muted"> · กรองอยู่</span>}
            </span>
            {bucket !== 'all' && (
              <a style={{ fontWeight: 400, cursor: 'pointer' }} onClick={() => setBucket('all')}>
                ดูทั้งหมด
              </a>
            )}
          </div>
          <div className="order-list">
            {orders.map((o) => (
              <div key={o.id} className="order-row" onClick={() => setOpenOrder(o.id)}>
                <span className="mono">{o.order_no}</span>
                <span>
                  <Tag size="small" variant="light" theme={o.problem ? 'danger' : statusTheme(o.status)}>
                    {statusText(o.status)}
                    {o.late_pickup ? ' · ช้า' : ''}
                    {o.late_delivery ? ' · ช้า' : ''}
                  </Tag>
                </span>
                <span className="addr">
                  {vehicleName(o.vehicle_type)} · {shortTime(o.created_at)} · {o.pickup_address} → {o.dropoff_address}
                </span>
              </div>
            ))}
            {!orders.length && <div className="muted" style={{ padding: 12 }}>ไม่มีออเดอร์</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">การแจ้งเตือน</div>
          <div className="alerts">
            {alerts.map((a, i) => (
              <div key={i} className="alert-row" onClick={() => a.orderId && setOpenOrder(a.orderId)} style={{ cursor: a.orderId ? 'pointer' : 'default' }}>
                <span className="muted">{shortTime(a.at)}</span>
                <Tag size="small" theme={a.kind === 'NO_DRIVER' || a.kind === 'RISK' ? 'danger' : 'warning'} variant="light">
                  {a.kind}
                </Tag>
                <span>{a.message}</span>
              </div>
            ))}
            {!alerts.length && <div className="muted" style={{ padding: 12 }}>ยังไม่มีการแจ้งเตือนในรอบนี้</div>}
          </div>
        </div>
      </div>
      <OrderDrawer orderId={openOrder} onClose={() => setOpenOrder(null)} onChanged={() => void reload()} />
    </div>
  );
}
