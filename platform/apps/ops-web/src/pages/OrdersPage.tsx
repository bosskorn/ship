import { ORDER_STATUS_TH } from '@ship/shared';
import { useState } from 'react';
import { Button, Input, Select, Table, Tag } from 'tdesign-react';
import { OrderDrawer } from '../components/OrderDrawer';
import { get } from '../lib/api';
import { statusTheme, statusText, thb, time, vehicleName } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const PAGE = 50;

export function OrdersPage() {
  const [status, setStatus] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, reload } = useAsync(() => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String((page - 1) * PAGE) });
    if (status.length) p.set('status', status.join(','));
    if (q) p.set('q', q);
    if (bucket) p.set('bucket', bucket);
    return get(`/ops/orders?${p}`);
  }, [status.join(','), bucket, page]);

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Select
            multiple
            clearable
            minCollapsedNum={2}
            placeholder="สถานะ"
            style={{ width: 320 }}
            value={status}
            onChange={(v) => setStatus(v as string[])}
            options={Object.entries(ORDER_STATUS_TH).map(([value, label]) => ({ value, label }))}
          />
          <Select
            clearable
            placeholder="กลุ่ม"
            style={{ width: 160 }}
            value={bucket}
            onChange={(v) => setBucket((v as string) ?? '')}
            options={[{ value: 'problem', label: 'มีปัญหา (ช้า/ไม่พบคนขับ)' }]}
          />
          <Input placeholder="เลขออเดอร์ / เบอร์โทร" style={{ width: 220 }} value={q} onChange={(v) => setQ(String(v))} onEnter={() => void reload()} clearable />
          <Button variant="outline" onClick={() => void reload()}>
            ค้นหา
          </Button>
        </div>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          data={data ?? []}
          hover
          onRowClick={({ row }) => setOpen(row.id)}
          columns={[
            { colKey: 'order_no', title: 'ออเดอร์', width: 150, cell: ({ row }) => <span className="mono">{row.order_no}</span> },
            {
              colKey: 'status',
              title: 'สถานะ',
              width: 150,
              cell: ({ row }) => (
                <Tag size="small" variant="light" theme={row.late_pickup || row.late_delivery ? 'danger' : statusTheme(row.status)}>
                  {statusText(row.status)}
                  {row.late_pickup || row.late_delivery ? ' · ช้า' : ''}
                </Tag>
              ),
            },
            { colKey: 'created_at', title: 'สร้างเมื่อ', width: 120, cell: ({ row }) => time(row.created_at) },
            { colKey: 'zone_code', title: 'โซน', width: 90 },
            { colKey: 'vehicle_type', title: 'รถ', width: 90, cell: ({ row }) => vehicleName(row.vehicle_type) },
            { colKey: 'route', title: 'เส้นทาง', ellipsis: true, cell: ({ row }) => `${row.pickup} → ${row.dropoff}` },
            { colKey: 'driver_name', title: 'คนขับ', width: 130, ellipsis: true },
            { colKey: 'price', title: 'ราคา', width: 80, align: 'right', cell: ({ row }) => thb(row.price) },
            {
              colKey: 'contribution_margin',
              title: 'CM',
              width: 80,
              align: 'right',
              cell: ({ row }) => <span className={row.contribution_margin < 0 ? 'bad' : ''}>{thb(row.contribution_margin)}</span>,
            },
          ]}
          pagination={{ current: page, pageSize: PAGE, total: (page - 1) * PAGE + (data?.length ?? 0) + (data?.length === PAGE ? 1 : 0), onCurrentChange: setPage, showPageSize: false }}
        />
      </div>
      <OrderDrawer orderId={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}
