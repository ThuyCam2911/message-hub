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

interface ChannelOption {
  id: string;
  name: string;
  channelType: string;
}

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

// Channels where the recipient has to opt in before you can message them —
// these implement ChannelAdapter.getInviteLink.
const INVITE_LINK_CHANNEL_TYPES = new Set(['telegram', 'zbs', 'line']);

// Only Telegram's invite link embeds the contact id itself (?start=<id>) —
// Zalo/LINE have no confirmed deep-link mechanism for that, so the contact
// has to be told to send their id as a text message instead.
const CHANNELS_NEEDING_MANUAL_CODE = new Set(['zbs', 'line']);

interface ImportResult {
  totalRows: number;
  created: number;
  errors: { row: number; message: string }[];
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Contact>>({});
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  const [displayName, setDisplayName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const [idChannelType, setIdChannelType] = useState<Record<string, string>>({});
  const [idKind, setIdKind] = useState<Record<string, string>>({});
  const [idValue, setIdValue] = useState<Record<string, string>>({});

  const [inviteChannelId, setInviteChannelId] = useState<Record<string, string>>({});
  const [inviteLink, setInviteLink] = useState<Record<string, string>>({});
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);

  const inviteCapableChannels = channels.filter((c) => INVITE_LINK_CHANNEL_TYPES.has(c.channelType));

  async function load() {
    try {
      const [c, ch] = await Promise.all([api.get<Contact[]>('/contacts'), api.get<ChannelOption[]>('/channels')]);
      setContacts(c);
      setChannels(ch);
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

  async function getInviteLink(contactId: string) {
    const channelId = inviteChannelId[contactId];
    if (!channelId) return;
    setError(null);
    setInviteLoading(contactId);
    try {
      const result = await api.get<{ url: string }>(`/contacts/${contactId}/invite-link/${channelId}`);
      setInviteLink({ ...inviteLink, [contactId]: result.url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviteLoading(null);
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

              {inviteCapableChannels.length > 0 && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.65rem 0.75rem',
                    background: 'var(--bg)',
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: '0.6rem',
                  }}
                >
                  <label style={{ minWidth: 200 }}>
                    Lấy invite link (Telegram/Zalo/LINE)
                    <select
                      value={inviteChannelId[c.id] ?? ''}
                      onChange={(e) => setInviteChannelId({ ...inviteChannelId, [c.id]: e.target.value })}
                    >
                      <option value="">-- chọn channel --</option>
                      {inviteCapableChannels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => getInviteLink(c.id)}
                    disabled={!inviteChannelId[c.id] || inviteLoading === c.id}
                  >
                    {inviteLoading === c.id ? 'Đang tạo...' : 'Tạo invite link'}
                  </button>
                  {inviteLink[c.id] &&
                    (() => {
                      const usedChannel = channels.find((ch) => ch.id === inviteChannelId[c.id]);
                      const needsManualCode = usedChannel && CHANNELS_NEEDING_MANUAL_CODE.has(usedChannel.channelType);
                      return (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          {needsManualCode ? (
                            <>
                              Gửi link này cho khách để họ mở chat, sau đó nhờ khách nhắn đúng mã sau vào chat (hệ thống tự
                              ghi nhận khi nhận được): <code className="gz-code-block">{c.id}</code>
                              <br />
                            </>
                          ) : (
                            'Gửi link này cho khách, họ bấm Start thì hệ thống tự ghi nhận: '
                          )}
                          <a href={inviteLink[c.id]} target="_blank" rel="noreferrer">
                            {inviteLink[c.id]}
                          </a>
                        </span>
                      );
                    })()}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
