'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

interface Contact {
  id: string;
  displayName: string;
}
interface Template {
  id: string;
  name: string;
}
interface Policy {
  id: string;
  name: string;
}

export default function SendTestPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } | null>(null);

  const [contactId, setContactId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [failoverPolicyId, setFailoverPolicyId] = useState('');
  const [variables, setVariables] = useState('{"name":"Chị Lan","code":"123456"}');

  useEffect(() => {
    Promise.all([
      api.get<Contact[]>('/contacts'),
      api.get<Template[]>('/templates'),
      api.get<Policy[]>('/failover-policies'),
    ])
      .then(([c, t, p]) => {
        setContacts(c);
        setTemplates(t);
        setPolicies(p);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const created = await api.post<{ id: string }>('/message-requests', {
        contactId,
        templateId,
        failoverPolicyId,
        templateVariables: JSON.parse(variables || '{}'),
      });
      setResult(created);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Send Test</h1>
      {error && <p className="error">{error}</p>}
      {result && (
        <p className="muted">
          Đã tạo message request <strong>{result.id}</strong>.
        </p>
      )}

      <form onSubmit={send}>
        <label>
          Contact
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
            <option value="">-- select --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
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
        <label>
          Template variables (JSON)
          <textarea rows={3} value={variables} onChange={(e) => setVariables(e.target.value)} />
        </label>
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
