import { KYC_STATUS_TH, KycStatus } from '@ship/shared';
import { useEffect, useState } from 'react';
import { Button, Dialog, Drawer, Image, Input, Select, Space, Table, Tag, Textarea } from 'tdesign-react';
import { get, post } from '../lib/api';
import { PRESENCE_TH, pct, time, vehicleName } from '../lib/format';
import { run, useAsync } from '../lib/useAsync';

const KYC_THEME: Record<string, 'default' | 'primary' | 'warning' | 'danger' | 'success'> = {
  DRAFT: 'default',
  PENDING: 'default',
  REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};

export function DriversPage({ isAdmin }: { isAdmin: boolean }) {
  const [kyc, setKyc] = useState<string>('');
  const [presence, setPresence] = useState<string>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, reload } = useAsync(() => {
    const p = new URLSearchParams({ limit: '100' });
    if (kyc) p.set('kyc', kyc);
    if (presence) p.set('presence', presence);
    if (q) p.set('q', q);
    return get(`/ops/drivers?${p}`);
  }, [kyc, presence]);

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Select clearable placeholder="สถานะ KYC" style={{ width: 180 }} value={kyc} onChange={(v) => setKyc((v as string) ?? '')} options={Object.entries(KYC_STATUS_TH).map(([value, label]) => ({ value, label }))} />
          <Select clearable placeholder="การออนไลน์" style={{ width: 150 }} value={presence} onChange={(v) => setPresence((v as string) ?? '')} options={Object.entries(PRESENCE_TH).map(([value, label]) => ({ value, label }))} />
          <Input placeholder="ชื่อ / เบอร์ / ทะเบียน" style={{ width: 220 }} value={q} onChange={(v) => setQ(String(v))} onEnter={() => void reload()} clearable />
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
            { colKey: 'name', title: 'ชื่อ', cell: ({ row }) => [row.first_name, row.last_name].filter(Boolean).join(' ') || <span className="muted">ยังไม่กรอก</span> },
            { colKey: 'phone', title: 'เบอร์', width: 130 },
            { colKey: 'kyc_status', title: 'KYC', width: 120, cell: ({ row }) => <Tag size="small" variant="light" theme={KYC_THEME[row.kyc_status]}>{KYC_STATUS_TH[row.kyc_status as KycStatus]}</Tag> },
            { colKey: 'presence', title: 'สถานะ', width: 80, cell: ({ row }) => PRESENCE_TH[row.presence] },
            { colKey: 'vehicle', title: 'รถ', width: 180, cell: ({ row }) => (row.vehicle_type ? `${vehicleName(row.vehicle_type)} ${row.plate_number}` : '–') },
            { colKey: 'tier', title: 'Tier', width: 90 },
            { colKey: 'rating', title: 'คะแนน', width: 70, cell: ({ row }) => (row.rating_count ? (row.rating_sum / row.rating_count).toFixed(1) : '–') },
            { colKey: 'acceptance', title: 'รับงาน', width: 70, cell: ({ row }) => (row.offers_received ? pct(row.offers_accepted / row.offers_received) : '–') },
            { colKey: 'trips_completed', title: 'งานสำเร็จ', width: 80 },
            { colKey: 'risk_score', title: 'Risk', width: 60, cell: ({ row }) => <span className={row.risk_score >= 60 ? 'bad' : ''}>{row.risk_score}</span> },
          ]}
        />
      </div>
      <DriverDrawer id={open} isAdmin={isAdmin} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}

function DriverDrawer({ id, isAdmin, onClose, onChanged }: { id: string | null; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<any>(null);
  const [pii, setPii] = useState<any>(null);
  const [decision, setDecision] = useState<null | 'APPROVED' | 'REJECTED' | 'SUSPENDED'>(null);
  const [note, setNote] = useState('');

  const load = async () => id && setD(await get(`/ops/drivers/${id}`));
  useEffect(() => {
    setD(null);
    setPii(null);
    void run(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const decide = async () => {
    const ok = await run(() => post(`/ops/drivers/${id}/kyc`, { decision, note }), 'บันทึกผลการตรวจสอบแล้ว');
    if (ok) {
      setDecision(null);
      setNote('');
      await load();
      onChanged();
    }
  };

  return (
    <Drawer visible={!!id} onClose={onClose} size="640px" header={d ? `${d.first_name ?? ''} ${d.last_name ?? ''} · ${d.phone}` : 'คนขับ'} footer={
      isAdmin && d ? (
        <Space>
          <Button theme="success" disabled={d.kyc_status === 'APPROVED'} onClick={() => setDecision('APPROVED')}>อนุมัติ</Button>
          <Button theme="warning" variant="outline" onClick={() => setDecision('REJECTED')}>ไม่อนุมัติ / ขอเอกสารเพิ่ม</Button>
          <Button theme="danger" variant="outline" onClick={() => setDecision('SUSPENDED')}>ระงับ</Button>
        </Space>
      ) : null
    }>
      {d && (
        <div style={{ display: 'grid', gap: 16 }}>
          <dl className="kv">
            <dt>KYC</dt>
            <dd>
              <Tag variant="light" theme={KYC_THEME[d.kyc_status]}>{KYC_STATUS_TH[d.kyc_status as KycStatus]}</Tag> {d.kyc_note && <span className="muted">{d.kyc_note}</span>}
            </dd>
            <dt>Tier</dt>
            <dd>{d.tier}</dd>
            <dt>ใบขับขี่หมดอายุ</dt>
            <dd>{d.license_expiry ? String(d.license_expiry).slice(0, 10) : '–'}</dd>
            <dt>สถิติ</dt>
            <dd className="num">
              รับงาน {d.offers_accepted}/{d.offers_received} · ปฏิเสธ {d.offers_declined} · หมดเวลา {d.offers_expired} · สำเร็จ {d.trips_completed} · ยกเลิก {d.trips_cancelled}
            </dd>
            <dt>ข้อมูลส่วนบุคคล</dt>
            <dd>
              {pii ? (
                <span className="mono">
                  บัตร {pii.nationalId} · ใบขับขี่ {pii.licenseNumber} {pii.bankAccount ? `· ${pii.bankAccount.bank} ${pii.bankAccount.number}` : ''}
                </span>
              ) : isAdmin ? (
                <Button size="small" variant="text" onClick={() => void run(async () => setPii(await get(`/ops/drivers/${id}/sensitive`)))}>
                  แสดง (บันทึกการเข้าดูใน audit log)
                </Button>
              ) : (
                <span className="muted">เข้ารหัส · เฉพาะผู้ดูแลระบบ</span>
              )}
            </dd>
          </dl>
          <section>
            <h4 style={{ margin: '0 0 8px' }}>รถ</h4>
            <Table size="small" rowKey="id" data={d.vehicles} columns={[
              { colKey: 'type', title: 'ประเภท', cell: ({ row }) => vehicleName(row.type) },
              { colKey: 'plate', title: 'ทะเบียน', cell: ({ row }) => `${row.plate_number} ${row.plate_province}` },
              { colKey: 'model', title: 'รุ่น', cell: ({ row }) => [row.brand, row.model, row.color].filter(Boolean).join(' ') },
              { colKey: 'status', title: 'สถานะ', width: 90 },
            ]} />
          </section>
          <section>
            <h4 style={{ margin: '0 0 8px' }}>เอกสาร</h4>
            <Space breakLine>
              {d.documents.map((doc: any) => (
                <div key={doc.id} style={{ display: 'grid', gap: 4 }}>
                  <Image src={doc.url} className="doc-thumb" fit="cover" />
                  <span className="muted">{doc.kind} · {doc.status}</span>
                </div>
              ))}
            </Space>
          </section>
          <section>
            <h4 style={{ margin: '0 0 8px' }}>สัญญาณความเสี่ยง</h4>
            <Table size="small" rowKey="id" data={d.risk} columns={[
              { colKey: 'created_at', title: 'เวลา', width: 120, cell: ({ row }) => time(row.created_at) },
              { colKey: 'type', title: 'ประเภท' },
              { colKey: 'score', title: 'คะแนน', width: 70 },
              { colKey: 'status', title: 'สถานะ', width: 90 },
            ]} />
          </section>
        </div>
      )}
      <Dialog visible={!!decision} header={decision === 'APPROVED' ? 'อนุมัติคนขับ' : decision === 'REJECTED' ? 'ไม่อนุมัติ' : 'ระงับบัญชี'} onClose={() => setDecision(null)} onConfirm={() => void decide()} confirmBtn={{ content: 'ยืนยัน', disabled: !note.trim() }}>
        <p className="muted">หมายเหตุถึงคนขับ (ส่ง SMS/Push และบันทึกใน audit log)</p>
        <Textarea value={note} onChange={(v) => setNote(String(v))} />
      </Dialog>
    </Drawer>
  );
}
