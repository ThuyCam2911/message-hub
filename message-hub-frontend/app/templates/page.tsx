'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';
import { CHANNEL_TYPES } from '../lib/channel-types';

interface Template {
  id: string;
  name: string;
  description?: string;
  channelType: string;
  body: string | Record<string, unknown>;
  variables: string[];
  isActive: boolean;
  sourceChannelId?: string;
  providerTemplateId?: string;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  approvalDetail?: string;
}

interface ChannelOption {
  id: string;
  name: string;
  channelType: string;
}

interface ProviderTemplateSummary {
  templateId: string;
  templateName: string;
  status: string;
}

interface MutationOutcome {
  deleted: boolean;
  deactivated: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  zbs: 'Zalo (ZBS)',
  sms: 'SMS',
  telegram: 'Telegram',
  line: 'LINE',
  whatsapp: 'WhatsApp',
  email: 'Email',
};

// Only channels whose adapter implements listTemplates/submitTemplate need
// these sections — keeping this list here avoids a round-trip just to know
// which tabs to show a Sync/Submit button on.
const SYNCABLE_CHANNEL_TYPES = new Set(['zbs']);
const SUBMITTABLE_CHANNEL_TYPES = new Set(['whatsapp']);

const APPROVAL_LABELS: Record<Template['approvalStatus'], string> = {
  not_required: 'Không cần duyệt',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

const APPROVAL_BADGE_CLASS: Record<Template['approvalStatus'], string> = {
  not_required: 'badge-inactive',
  pending: 'badge-inactive',
  approved: 'badge-active',
  rejected: 'badge-inactive',
};

type BodyMode = 'plain' | 'email' | 'zns';

function defaultBodyModeFor(channelType: string): BodyMode {
  if (channelType === 'email') return 'email';
  return 'plain';
}

function bodyToString(body: string | Record<string, unknown>): string {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasRole('admin', 'operator');

  const [activeTab, setActiveTab] = useState('email');

  const [name, setName] = useState('');
  const [bodyMode, setBodyMode] = useState<BodyMode>('email');
  const [variables, setVariables] = useState('');
  const [submitChannelId, setSubmitChannelId] = useState('');

  const [plainBody, setPlainBody] = useState('Xin chào {{name}}, mã của bạn là {{code}}');
  const [emailSubject, setEmailSubject] = useState('Hello {{name}}');
  const [emailHtml, setEmailHtml] = useState('<p>Hi {{name}}, your code is {{code}}</p>');
  const [znsTemplateId, setZnsTemplateId] = useState('');
  const [znsTemplateData, setZnsTemplateData] = useState('{"customer_name":"{{name}}","otp":"{{code}}"}');
  const [paramName, setParamName] = useState('');

  const [syncChannelId, setSyncChannelId] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editVariables, setEditVariables] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewVariables, setPreviewVariables] = useState('{}');
  const [previewResult, setPreviewResult] = useState<unknown>(null);

  const channelsForTab = channels.filter((c) => c.channelType === activeTab);
  const templatesForTab = templates.filter((t) => t.channelType === activeTab);

  // Computed once per render instead of re-filtering the full templates
  // array twice per tab (count + truthy check) inside the tab-bar JSX below.
  const templateCountByChannelType = templates.reduce<Record<string, number>>((counts, t) => {
    counts[t.channelType] = (counts[t.channelType] ?? 0) + 1;
    return counts;
  }, {});

  function onTabChange(value: string) {
    setActiveTab(value);
    setBodyMode(defaultBodyModeFor(value));
    setSubmitChannelId('');
    setSyncChannelId('');
  }

  async function load() {
    try {
      const [t, c] = await Promise.all([
        api.get<Template[]>('/templates'),
        api.get<ChannelOption[]>('/channels'),
      ]);
      setTemplates(t);
      setChannels(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function insertParam() {
    const key = paramName.trim();
    if (!key) return;
    const token = `{{${key}}}`;
    if (bodyMode === 'email') {
      setEmailHtml((v) => v + token);
    } else if (bodyMode === 'zns') {
      // Parse-and-stringify instead of regex text surgery — the old regex
      // approach broke on an empty object ('{}') by inserting a stray
      // leading comma, producing invalid JSON.
      setZnsTemplateData((v) => {
        try {
          const parsed = JSON.parse(v || '{}');
          parsed[key] = token;
          return JSON.stringify(parsed);
        } catch {
          return v;
        }
      });
    } else {
      setPlainBody((v) => v + token);
    }
  }

  async function syncTemplates() {
    if (!syncChannelId) return;
    setError(null);
    setSyncing(true);
    try {
      const result = await api.post<{ created: number; updated: number }>(`/templates/sync/${syncChannelId}`, {});
      alert(`Sync xong: tạo mới ${result.created}, cập nhật ${result.updated} template.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

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
        channelType: activeTab,
        body,
        variables: variables
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        sourceChannelId: submitChannelId || undefined,
      });
      setName('');
      setSubmitChannelId('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDescription(t.description ?? '');
    setEditBody(bodyToString(t.body));
    setEditVariables(t.variables.join(', '));
    setEditIsActive(t.isActive);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(t: Template) {
    setError(null);
    try {
      let body: string | Record<string, unknown> = editBody;
      if (typeof t.body === 'object') {
        try {
          body = JSON.parse(editBody);
        } catch {
          setError('Body JSON không hợp lệ');
          return;
        }
      }
      await api.patch(`/templates/${t.id}`, {
        name: editName,
        description: editDescription || undefined,
        body,
        variables: editVariables
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        isActive: editIsActive,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteTemplate(t: Template) {
    if (!confirm(`Xoá template "${t.name}"? Nếu đang được dùng, hệ thống sẽ chuyển sang Inactive thay vì xoá hẳn.`)) return;
    setError(null);
    try {
      const result = await api.delete<MutationOutcome>(`/templates/${t.id}`);
      alert(result.deleted ? 'Đã xoá template.' : 'Template đang được dùng nên đã chuyển sang Inactive thay vì xoá.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
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
      <p className="muted">
        Dùng <code>{'{{ten_bien}}'}</code> trong nội dung — hệ thống tự nhận các biến này, không cần khai báo lại. Khi gửi
        campaign từ CSV, cột nào trùng tên biến (vd cột <code>hocphi</code> ↔ <code>{'{{hocphi}}'}</code>) sẽ tự động điền.
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '1rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
        {CHANNEL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={activeTab === t ? '' : 'secondary'}
            onClick={() => onTabChange(t)}
          >
            {CHANNEL_LABELS[t]} {templateCountByChannelType[t] > 0 && `(${templateCountByChannelType[t]})`}
          </button>
        ))}
      </div>

      {SYNCABLE_CHANNEL_TYPES.has(activeTab) && (
        <div
          style={{
            padding: '0.75rem',
            background: 'var(--bg)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 8,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '0.6rem',
            marginBottom: '1rem',
          }}
        >
          <label style={{ minWidth: 220 }}>
            Sync template đã duyệt từ Zalo
            <select value={syncChannelId} onChange={(e) => setSyncChannelId(e.target.value)}>
              <option value="">-- chọn channel Zalo --</option>
              {channelsForTab.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={syncTemplates} disabled={!syncChannelId || syncing}>
            {syncing ? 'Đang sync...' : 'Sync template'}
          </button>
          <span className="muted" style={{ fontSize: '0.76rem' }}>
            Zalo ZNS không có API tạo template mới — chỉ có thể sync template đã được duyệt qua cổng zns.zalo.me. Template mới
            hiện lên ở danh sách bên dưới, chỉnh templateData rồi Save.
          </span>
        </div>
      )}

      {canManage && (
        <>
          <h2>Tạo template cho {CHANNEL_LABELS[activeTab]}</h2>
          <form onSubmit={createTemplate}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>

            {activeTab === 'zbs' && (
              <label>
                Body type
                <select value={bodyMode} onChange={(e) => setBodyMode(e.target.value as BodyMode)}>
                  <option value="plain">Plain text (Zalo OA / zbs_uid)</option>
                  <option value="zns">ZNS structured template (zbs_phone)</option>
                </select>
              </label>
            )}

            {SUBMITTABLE_CHANNEL_TYPES.has(activeTab) && (
              <label>
                Submit lên provider để duyệt (không bắt buộc)
                <select value={submitChannelId} onChange={(e) => setSubmitChannelId(e.target.value)}>
                  <option value="">-- không submit, chỉ lưu local --</option>
                  {channelsForTab.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="muted" style={{ fontSize: '0.76rem', fontWeight: 400 }}>
                  Gọi API Meta để submit template chờ WhatsApp duyệt (cần channel đã cấu hình WhatsApp Business Account ID).
                </span>
              </label>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', margin: '0.5rem 0' }}>
              <label style={{ margin: 0 }}>
                Chèn param nhanh
                <input value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="vd: hocphi" />
              </label>
              <button type="button" className="secondary" onClick={insertParam} disabled={!paramName.trim()}>
                Chèn {'{{' + (paramName.trim() || 'param') + '}}'} vào body
              </button>
            </div>

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
                  Zalo ZNS Template ID (pre-approved với Zalo — hoặc để trống nếu sẽ Sync ở trên)
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
              Variables bổ sung (không bắt buộc — biến trong body tự nhận rồi)
              <input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="vd: hocphi, ten_khoa_hoc" />
            </label>
            <button type="submit">Create template</button>
          </form>
        </>
      )}

      <h2>Templates ({templatesForTab.length})</h2>
      {templatesForTab.length === 0 && <p className="muted">Chưa có template nào cho {CHANNEL_LABELS[activeTab]}.</p>}
      {templatesForTab.map((t) => {
        const isEditing = editingId === t.id;
        return (
          <div className="card" key={t.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong>{t.name}</strong>{' '}
                <span className={`badge ${APPROVAL_BADGE_CLASS[t.approvalStatus]}`}>{APPROVAL_LABELS[t.approvalStatus]}</span>{' '}
                {!t.isActive && <span className="badge badge-inactive">Inactive</span>}
                {t.approvalDetail && <div className="muted" style={{ fontSize: '0.76rem' }}>Provider status: {t.approvalDetail}</div>}
                {t.providerTemplateId && <div className="muted" style={{ fontSize: '0.76rem' }}>Provider template ID: {t.providerTemplateId}</div>}
                <div className="muted">variables: {t.variables.join(', ') || '(none)'}</div>
                {!isEditing && <div className="muted">body: {bodyToString(t.body)}</div>}
              </div>
              {canManage && (
                <span style={{ display: 'flex', gap: '0.4rem', height: 'fit-content' }}>
                  <button className="secondary" onClick={() => (isEditing ? cancelEdit() : startEdit(t))}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                  <button className="secondary" onClick={() => deleteTemplate(t)}>
                    Delete
                  </button>
                  <button className="secondary" onClick={() => setPreviewingId(previewingId === t.id ? null : t.id)}>
                    {previewingId === t.id ? 'Hide preview' : 'Preview'}
                  </button>
                </span>
              )}
            </div>

            {isEditing && (
              <div style={{ marginTop: '0.6rem', padding: '0.6rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <label>
                  Name
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </label>
                <label>
                  Description
                  <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                </label>
                <label>
                  Body {typeof t.body === 'object' && '(JSON)'}
                  <textarea rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} required />
                </label>
                <label>
                  Variables (comma-separated — biến trong body vẫn tự nhận thêm)
                  <input value={editVariables} onChange={(e) => setEditVariables(e.target.value)} />
                </label>
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
                  <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} />
                  Active
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => saveEdit(t)}>
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {previewingId === t.id && !isEditing && (
              <div style={{ marginTop: '0.6rem' }}>
                <label>
                  Sample variables (JSON)
                  <textarea rows={2} value={previewVariables} onChange={(e) => setPreviewVariables(e.target.value)} />
                </label>
                <button type="button" onClick={() => runPreview(t.id)}>
                  Render
                </button>
                {previewResult != null && (
                  <pre className="gz-code-block" style={{ marginTop: '0.5rem' }}>
                    {typeof previewResult === 'string' ? previewResult : JSON.stringify(previewResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
