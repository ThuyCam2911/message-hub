'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';

interface Identifier {
  id: string;
  channelType: string;
  identifierKind: string;
  value: string;
}

interface Contact {
  id: string;
  displayName: string;
  externalRef?: string;
  identifiers?: Identifier[];
}

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

interface ImportResult {
  totalRows: number;
  created: number;
  errors: { row: number; message: string }[];
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Contact>>({});
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const [idChannelType, setIdChannelType] = useState<Record<string, string>>({});
  const [idKind, setIdKind] = useState<Record<string, string>>({});
  const [idValue, setIdValue] = useState<Record<string, string>>({});

  async function load() {
    try {
      setContacts(await api.get<Contact[]>('/contacts'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/contacts', { displayName });
      setDisplayName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;
    setError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const result = await api.post<ImportResult>('/contacts/import', formData);
      setImportResult(result);
      setImportFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expanded[id]) {
      const next = { ...expanded };
      delete next[id];
      setExpanded(next);
      return;
    }
    const detail = await api.get<Contact>(`/contacts/${id}`);
    setExpanded({ ...expanded, [id]: detail });
  }

  async function addIdentifier(contactId: string) {
    setError(null);
    try {
      await api.post(`/contacts/${contactId}/identifiers`, {
        channelType: idChannelType[contactId] ?? 'mock',
        identifierKind: idKind[contactId] ?? 'mock_id',
        value: idValue[contactId] ?? '',
      });
      const detail = await api.get<Contact>(`/contacts/${contactId}`);
      setExpanded({ ...expanded, [contactId]: detail });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const canManage = hasRole('admin', 'operator');

  return (
    <div>
      <h1>Contacts</h1>
      {error && <p className="error">{error}</p>}
      {!canManage && <p className="muted">Bạn đang xem ở chế độ chỉ đọc (viewer).</p>}

      {canManage && (
        <>
          <h2>Add a contact</h2>
          <form onSubmit={createContact}>
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
            <button type="submit">Create contact</button>
          </form>

          <h2>Import CSV</h2>
          <p className="muted">
            Cột bắt buộc: <code>displayName</code>. Cột identifier tùy chọn (ít nhất 1): <code>email</code>,{' '}
            <code>sms_phone</code>, <code>zbs_phone</code>, <code>zbs_uid</code>, <code>whatsapp_phone</code>,{' '}
            <code>telegram_chat_id</code>, <code>line_user_id</code>, và <code>externalRef</code> (tùy chọn).
          </p>
          <form onSubmit={importCsv}>
            <label>
              CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
            <button type="submit" disabled={!importFile || importing}>
              {importing ? 'Đang import...' : 'Import'}
            </button>
          </form>
        </>
      )}
      {importResult && (
        <div className="card">
          <div>
            Tổng {importResult.totalRows} dòng — tạo thành công <strong>{importResult.created}</strong>, lỗi{' '}
            <strong>{importResult.errors.length}</strong>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="muted">
              {importResult.errors.map((e, i) => (
                <li key={i}>
                  Dòng {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2>Contacts</h2>
      {contacts.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{c.displayName}</strong> <span className="muted">{c.id}</span>
            </div>
            <button className="secondary" onClick={() => toggleExpand(c.id)}>
              {expanded[c.id] ? 'Hide' : 'Manage identifiers'}
            </button>
          </div>

          {expanded[c.id] && (
            <div style={{ marginTop: '0.75rem' }}>
              <ul>
                {(expanded[c.id].identifiers ?? []).map((i) => (
                  <li key={i.id}>
                    {i.channelType} / {i.identifierKind}: {i.value}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <label>
                  Channel
                  <select
                    value={idChannelType[c.id] ?? 'mock'}
                    onChange={(e) => setIdChannelType({ ...idChannelType, [c.id]: e.target.value })}
                  >
                    {CHANNEL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kind
                  <input
                    placeholder="uid, phone, chat_id, email, mock_id..."
                    value={idKind[c.id] ?? ''}
                    onChange={(e) => setIdKind({ ...idKind, [c.id]: e.target.value })}
                  />
                </label>
                <label>
                  Value
                  <input value={idValue[c.id] ?? ''} onChange={(e) => setIdValue({ ...idValue, [c.id]: e.target.value })} />
                </label>
                <button type="button" onClick={() => addIdentifier(c.id)}>
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
