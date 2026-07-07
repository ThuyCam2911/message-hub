'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

interface Template {
  id: string;
  name: string;
  channelType: string;
  body: string | Record<string, unknown>;
  variables: string[];
}

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState('email');
  const [body, setBody] = useState('{"subject":"Hello {{name}}","html":"<p>Hi {{name}}, your code is {{code}}</p>"}');
  const [variables, setVariables] = useState('name, code');

  async function load() {
    try {
      setTemplates(await api.get<Template[]>('/templates'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const trimmed = body.trim();
      const parsedBody = trimmed.startsWith('{') ? JSON.parse(trimmed) : trimmed;
      await api.post('/templates', {
        name,
        channelType,
        body: parsedBody,
        variables: variables
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      });
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Templates</h1>
      {error && <p className="error">{error}</p>}

      <h2>Create a template</h2>
      <form onSubmit={createTemplate}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Channel type
          <select value={channelType} onChange={(e) => setChannelType(e.target.value)}>
            {CHANNEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Body (plain text for SMS/Telegram/Line, JSON object for email e.g. {'{'}"subject","html"{'}'})
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label>
          Variables (comma-separated)
          <input value={variables} onChange={(e) => setVariables(e.target.value)} />
        </label>
        <button type="submit">Create template</button>
      </form>

      <h2>Existing templates</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Channel</th>
            <th>Variables</th>
            <th>Body</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.channelType}</td>
              <td>{t.variables.join(', ')}</td>
              <td className="muted">{typeof t.body === 'string' ? t.body : JSON.stringify(t.body)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
