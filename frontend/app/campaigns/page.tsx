'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';

interface Template {
  id: string;
  name: string;
}
interface Policy {
  id: string;
  name: string;
}
interface Contact {
  id: string;
  displayName: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  templateId: string;
  failoverPolicyId: string;
  progress: { total: number; delivered: number; failed: number; inProgress: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasRole('admin', 'operator');

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [failoverPolicyId, setFailoverPolicyId] = useState('');

  const [allContacts, setAllContacts] = useState<Record<string, boolean>>({});
  const [selectedContacts, setSelectedContacts] = useState<Record<string, string[]>>({});

  async function load() {
    try {
      const [c, t, p, contactList] = await Promise.all([
        api.get<Campaign[]>('/campaigns'),
        api.get<Template[]>('/templates'),
        api.get<Policy[]>('/failover-policies'),
        api.get<Contact[]>('/contacts'),
      ]);
      setCampaigns(c);
      setTemplates(t);
      setPolicies(p);
      setContacts(contactList);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/campaigns', { name, templateId, failoverPolicyId });
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function triggerCampaign(id: string) {
    setError(null);
    try {
      const contactIds = selectedContacts[id] ?? [];
      await api.post(`/campaigns/${id}/trigger`, {
        allContacts: !!allContacts[id],
        contactIds: allContacts[id] ? undefined : contactIds,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleContact(campaignId: string, contactId: string) {
    const current = selectedContacts[campaignId] ?? [];
    const next = current.includes(contactId) ? current.filter((c) => c !== contactId) : [...current, contactId];
    setSelectedContacts({ ...selectedContacts, [campaignId]: next });
  }

  return (
    <div>
      <h1>Campaigns</h1>
      <p className="muted">
        Gửi hàng loạt: chọn template + failover policy, chọn danh sách contact (hoặc toàn bộ), rồi trigger. Mỗi
        contact nhận 1 message request riêng, biến {'{{'}variable{'}}'} lấy từ attributes của contact đó (cá nhân hoá).
      </p>
      {error && <p className="error">{error}</p>}

      {canManage && (
        <>
          <h2>Create a campaign</h2>
          <form onSubmit={createCampaign}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">-- select --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Failover policy
              <select value={failoverPolicyId} onChange={(e) => setFailoverPolicyId(e.target.value)} required>
                <option value="">-- select --</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Create campaign</button>
          </form>
        </>
      )}

      <h2>Campaigns</h2>
      {campaigns.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{c.name}</strong>
            <span className={`badge badge-${c.status === 'running' ? 'in_progress' : c.status}`}>{c.status}</span>
          </div>
          <div className="muted" style={{ marginTop: '0.4rem' }}>
            Tổng {c.progress.total} — delivered {c.progress.delivered}, failed {c.progress.failed}, in progress{' '}
            {c.progress.inProgress}
          </div>

          {canManage && c.status === 'draft' && (
            <div style={{ marginTop: '0.6rem' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={!!allContacts[c.id]}
                  onChange={(e) => setAllContacts({ ...allContacts, [c.id]: e.target.checked })}
                />
                Gửi cho toàn bộ contact ({contacts.length})
              </label>
              {!allContacts[c.id] && (
                <div style={{ maxHeight: 150, overflowY: 'auto', margin: '0.5rem 0' }}>
                  {contacts.map((contact) => (
                    <label key={contact.id} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={(selectedContacts[c.id] ?? []).includes(contact.id)}
                        onChange={() => toggleContact(c.id, contact.id)}
                      />
                      {contact.displayName}
                    </label>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => triggerCampaign(c.id)}>
                Trigger send
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
