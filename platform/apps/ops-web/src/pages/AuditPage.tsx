import { useState } from 'react';
import { Button, Input, Table } from 'tdesign-react';
import { get } from '../lib/api';
import { time } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const { data, loading, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (entityType) p.set('entityType', entityType);
    if (entityId) p.set('entityId', entityId);
    return get(`/ops/audit-logs?${p}`);
  });
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Input placeholder="entity type (order, driver, pricing_rule...)" style={{ width: 260 }} value={entityType} onChange={(v) => setEntityType(String(v))} />
          <Input placeholder="entity id" style={{ width: 300 }} value={entityId} onChange={(v) => setEntityId(String(v))} />
          <Button variant="outline" onClick={() => void reload()}>
            ค้นหา
          </Button>
          <span className="muted">Append-only (แก้ไข/ลบไม่ได้ในฐานข้อมูล)</span>
        </div>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          data={data ?? []}
          columns={[
            { colKey: 'created_at', title: 'เวลา', width: 130, cell: ({ row }) => time(row.created_at) },
            { colKey: 'actor', title: 'ผู้ทำ', width: 180, cell: ({ row }) => `${row.actor_email ?? row.actor_id ?? 'SYSTEM'} (${row.actor_role})` },
            { colKey: 'action', title: 'การกระทำ', width: 200 },
            { colKey: 'entity', title: 'Entity', width: 260, cell: ({ row }) => <span className="mono">{row.entity_type}:{row.entity_id}</span> },
            { colKey: 'reason', title: 'เหตุผล', ellipsis: true },
            { colKey: 'after', title: 'ค่าใหม่', ellipsis: true, cell: ({ row }) => <span className="mono">{row.after ? JSON.stringify(row.after) : ''}</span> },
          ]}
        />
      </div>
    </div>
  );
}
