import { useState } from 'react';
import { Button, Dialog, Select, Table, Tag, Textarea } from 'tdesign-react';
import { get, post } from '../lib/api';
import { time } from '../lib/format';
import { run, useAsync } from '../lib/useAsync';

export function RiskPage() {
  const [status, setStatus] = useState('OPEN');
  const { data, loading, reload } = useAsync(() => get(`/ops/risk-events${status ? `?status=${status}` : ''}`), [status]);
  const [review, setReview] = useState<any>(null);
  const [note, setNote] = useState('');

  const submit = async (decision: string) => {
    const ok = await run(() => post(`/ops/risk-events/${review.id}/review`, { decision, note }), 'บันทึกแล้ว');
    if (ok) {
      setReview(null);
      setNote('');
      void reload();
    }
  };

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Select clearable value={status} style={{ width: 160 }} onChange={(v) => setStatus((v as string) ?? '')} options={['OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED'].map((v) => ({ value: v, label: v }))} />
          <span className="muted">ระบบให้คะแนนความเสี่ยงและแจ้งเตือน ไม่แบนอัตโนมัติ — ทีมงานตรวจสอบและตัดสินใจ</span>
        </div>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          data={data ?? []}
          columns={[
            { colKey: 'created_at', title: 'เวลา', width: 120, cell: ({ row }) => time(row.created_at) },
            { colKey: 'type', title: 'ประเภท', width: 190, cell: ({ row }) => <Tag size="small" theme={row.score >= 40 ? 'danger' : 'warning'} variant="light">{row.type}</Tag> },
            { colKey: 'score', title: 'คะแนน', width: 70 },
            { colKey: 'who', title: 'ผู้ใช้', width: 180, cell: ({ row }) => [row.first_name, row.last_name].filter(Boolean).join(' ') || row.phone },
            { colKey: 'details', title: 'รายละเอียด', ellipsis: true, cell: ({ row }) => <span className="mono">{JSON.stringify(row.details)}</span> },
            { colKey: 'status', title: 'สถานะ', width: 90 },
            { colKey: 'op', title: '', width: 80, cell: ({ row }) => row.status === 'OPEN' && <Button size="small" variant="text" onClick={() => setReview(row)}>ตรวจสอบ</Button> },
          ]}
        />
      </div>
      <Dialog visible={!!review} header="ผลการตรวจสอบ" onClose={() => setReview(null)} footer={
        <>
          <Button variant="outline" disabled={!note} onClick={() => void submit('DISMISSED')}>ไม่ใช่การทุจริต</Button>
          <Button variant="outline" disabled={!note} onClick={() => void submit('REVIEWED')}>รับทราบ / เฝ้าระวัง</Button>
          <Button theme="danger" disabled={!note} onClick={() => void submit('ACTIONED')}>ดำเนินการแล้ว</Button>
        </>
      }>
        <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{review && JSON.stringify(review.details, null, 2)}</pre>
        <Textarea placeholder="บันทึก" value={note} onChange={(v) => setNote(String(v))} />
      </Dialog>
    </div>
  );
}
