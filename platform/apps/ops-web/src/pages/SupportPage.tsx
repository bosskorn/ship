import { useState } from 'react';
import { Button, Dialog, Input, Select, Table, Textarea } from 'tdesign-react';
import { Field, Fields } from '../components/Field';
import { get, post } from '../lib/api';
import { time } from '../lib/format';
import { run, useAsync } from '../lib/useAsync';

export function SupportPage() {
  const [status, setStatus] = useState('OPEN');
  const { data, loading, reload } = useAsync(() => get(`/ops/support-cases${status ? `?status=${status}` : ''}`), [status]);
  const [draft, setDraft] = useState<any>(null);

  const create = async () => {
    const ok = await run(() => post('/ops/support-cases', draft), 'สร้างเคสแล้ว');
    if (ok) {
      setDraft(null);
      void reload();
    }
  };
  const update = (id: string, s: string) => run(() => post(`/ops/support-cases/${id}`, { status: s }), 'อัปเดตแล้ว').then(() => reload());

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Select clearable value={status} style={{ width: 160 }} onChange={(v) => setStatus((v as string) ?? '')} options={['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((v) => ({ value: v, label: v }))} />
          <Button onClick={() => setDraft({ category: 'DELIVERY_ISSUE', priority: 'NORMAL', description: '' })}>เปิดเคส</Button>
        </div>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          data={data ?? []}
          columns={[
            { colKey: 'created_at', title: 'เวลา', width: 120, cell: ({ row }) => time(row.created_at) },
            { colKey: 'order_no', title: 'ออเดอร์', width: 150 },
            { colKey: 'category', title: 'หมวด', width: 140 },
            { colKey: 'priority', title: 'ความสำคัญ', width: 90 },
            { colKey: 'description', title: 'รายละเอียด', ellipsis: true },
            { colKey: 'status', title: 'สถานะ', width: 140, cell: ({ row }) => <Select size="small" value={row.status} onChange={(v) => void update(row.id, String(v))} options={['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((v) => ({ value: v, label: v }))} /> },
          ]}
        />
      </div>
      <Dialog visible={!!draft} header="เปิดเคสซัพพอร์ต" onClose={() => setDraft(null)} onConfirm={() => void create()}>
        {draft && (
          <Fields>
            <Field label="Order ID (ถ้ามี)">
              <Input value={draft.orderId ?? ''} onChange={(v) => setDraft({ ...draft, orderId: v || undefined })} />
            </Field>
            <Field label="หมวด">
              <Select value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} options={['DELIVERY_ISSUE', 'DAMAGED', 'LOST', 'PAYMENT', 'DRIVER_BEHAVIOR', 'APP_ISSUE', 'OTHER'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="ความสำคัญ">
              <Select value={draft.priority} onChange={(v) => setDraft({ ...draft, priority: v })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="รายละเอียด">
              <Textarea value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
            </Field>
          </Fields>
        )}
      </Dialog>
    </div>
  );
}
