'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';

interface Template {
  id: string;
  name: string;
  channelType: string;
  body: string | Record<string, unknown>;
  variables: string[];
}

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

type BodyMode = 'plain' | 'email' | 'zns';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasRole('admin', 'operator');

  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState('email');
  const [bodyMode, setBodyMode] = useState<BodyMode>('email');
  const [variables, setVariables] = useState('name, code');

  // Structured fields per body mode — composed into the actual `body` payload on submit.
  const [plainBody, setPlainBody] = useState('Xin chào {{name}}, mã của bạn là {{code}}');
  const [emailSubject, setEmailSubject] = useState('Hello {{name}}');
  const [emailHtml, setEmailHtml] = useState('<p>Hi {{name}}, your code is {{code}}</p>');
  const [znsTemplateId, setZnsTemplateId] = useState('');
  const [znsTemplateData, setZnsTemplateData] = useState('{"customer_name":"{{name}}","otp":"{{code}}"}');

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewVariables, setPreviewVariables] = useState('{}');
  const [previewResult, setPreviewResult] = useState<unknown>(null);

  function onChannelTypeChange(value: string) {
    setChannelType(value);
    setBodyMode(value === 'email' ? 'email' : 'plain');
  }

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
      let body: string | Record<string, unknown>;
      if (bodyMode === 'email') {
        body = { subject: emailSubject, html: emailHtml };
      } else if (bodyMode === 'zns') {
        body = { templateId: znsTemplateId, templateData: JSON.parse(znsTemplateData || '{}') };
      } else {
        body = plainBody;
      }

      await api.post('/templates', {
        name,
        channelType,
        body,
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

  async function togglePreview(id: string) {
    if (previewingId === id) {
      setPreviewingId(null);
      setPreviewResult(null);
      return;
    }
    setPreviewingId(id);
    setPreviewResult(null);
  }

  async function runPreview(id: string) {
    setError(null);
    try {
      const parsedVariables = JSON.parse(previewVariables || '{}');
      const result = await api.post<{ rendered: unknown }>(`/templates/${id}/preview`, { variables: parsedVariables });
      setPreviewResult(result.rendered);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Templates</h1>
      {error && <p className="error">{error}</p>}

      {canManage && (
        <>
          <h2>Create a template</h2>
          <form onSubmit={createTemplate}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Channel type
              <select value={channelType} onChange={(e) => onChannelTypeChange(e.target.value)}>
                {CHANNEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {channelType === 'zbs' && (
              <label>
                Body type
                <select value={bodyMode} onChange={(e) => setBodyMode(e.target.value as BodyMode)}>
                  <option value="plain">Plain text (Zalo OA / zbs_uid)</option>
                  <option value="zns">ZNS structured template (zbs_phone)</option>
                </select>
              </label>
            )}

            {bodyMode === 'email' && (
              <>
                <label>
                  Subject
                  <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required />
                </label>
                <label>
                  HTML body
                  <textarea rows={5} value={emailHtml} onChange={(e) => setEmailHtml(e.target.value)} required />
                </label>
              </>
            )}

            {bodyMode === 'zns' && (
              <>
                <label>
                  Zalo ZNS Template ID (pre-approved with Zalo)
                  <input value={znsTemplateId} onChange={(e) => setZnsTemplateId(e.target.value)} required />
                </label>
                <label>
                  Template data (JSON mapping ZNS placeholder -&gt; value/{'{{variable}}'})
                  <textarea rows={4} value={znsTemplateData} onChange={(e) => setZnsTemplateData(e.target.value)} />
                </label>
              </>
            )}

            {bodyMode === 'plain' && (
              <label>
                Body text (dùng {'{{variable}}'} để chèn biến)
                <textarea rows={4} value={plainBody} onChange={(e) => setPlainBody(e.target.value)} required />
              </label>
            )}

            <label>
              Variables (comma-separated)
              <input value={variables} onChange={(e) => setVariables(e.target.value)} />
            </label>
            <button type="submit">Create template</button>
          </form>
        </>
      )}

      <h2>Existing templates</h2>
      {templates.map((t) => (
        <div className="card" key={t.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{t.name}</strong> <span className="muted">({t.channelType})</span>
              <div className="muted">variables: {t.variables.join(', ') || '(none)'}</div>
              <div className="muted">body: {typeof t.body === 'string' ? t.body : JSON.stringify(t.body)}</div>
            </div>
            <button className="secondary" onClick={() => togglePreview(t.id)}>
              {previewingId === t.id ? 'Hide preview' : 'Preview'}
            </button>
          </div>
          {previewingId === t.id && (
            <div style={{ marginTop: '0.6rem' }}>
              <label>
                Sample variables (JSON)
                <textarea rows={2} value={previewVariables} onChange={(e) => setPreviewVariables(e.target.value)} />
              </label>
              <button type="button" onClick={() => runPreview(t.id)}>
                Render
              </button>
              {previewResult != null && (
                <pre style={{ background: '#0f1117', padding: '0.6rem', borderRadius: 6, marginTop: '0.5rem' }}>
                  {typeof previewResult === 'string' ? previewResult : JSON.stringify(previewResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
