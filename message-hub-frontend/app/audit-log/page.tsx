'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

interface AuditLogEntry {
  id: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  diff?: Record<string, unknown>;
  createdAt: string;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AuditLogEntry[]>('/audit-log')
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1>Audit Log</h1>
      <p className="muted">Lịch sử thay đổi cấu hình (channel, template, failover policy). Chỉ admin xem được.</p>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted">{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.action}</td>
              <td className="muted">
                {e.entityType} / {e.entityId.slice(0, 8)}
              </td>
              <td className="muted">{e.diff ? JSON.stringify(e.diff) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
