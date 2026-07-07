'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { hasRole } from '../lib/auth';

interface AdapterConfigProperty {
  type: 'string' | 'number' | 'boolean';
  title: string;
  description?: string;
  secret?: boolean;
}

interface ConfigSchema {
  type: 'object';
  properties: Record<string, AdapterConfigProperty>;
  required?: string[];
}

interface AdapterInfo {
  strategyKey: string;
  channelType: string;
  identifierKind: string;
  configSchema: ConfigSchema;
}

interface StrategyView {
  id: string;
  strategyKey: string;
  adapterName: string;
  isActive: boolean;
}

interface ChannelView {
  id: string;
  channelType: string;
  name: string;
  provider: string;
  isActive: boolean;
  configPreview: string;
  strategies: StrategyView[];
}

interface MutationOutcome {
  deleted: boolean;
  deactivated: boolean;
}

type ConfigValues = Record<string, string | boolean>;

// 'mock' is intentionally left out — it's a fake test-only provider with no
// real send capability, so it shouldn't be offered when creating new
// channels (existing mock channels from earlier testing can still be
// managed/removed via the "Hiện channel test/mock" toggle below).
const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email'];

const CHANNEL_ICONS: Record<string, string> = {
  zbs: '🎫',
  sms: '💬',
  telegram: '✈️',
  line: '💚',
  whatsapp: '📞',
  email: '✉️',
  mock: '🧪',
};

function outcomeMessage(result: MutationOutcome, deletedLabel: string, deactivatedLabel: string): string {
  return result.deleted ? deletedLabel : deactivatedLabel;
}

// Multiple adapters can share a channelType (e.g. zbs_uid + zbs_phone both
// need an "accessToken"); merge their schemas so the channel-level form
// covers every field a strategy on that channel might need.
function mergeSchemasForChannelType(channelType: string, adapters: AdapterInfo[]): ConfigSchema {
  const properties: ConfigSchema['properties'] = {};
  const required = new Set<string>();
  for (const a of adapters) {
    if (a.channelType !== channelType) continue;
    for (const [key, prop] of Object.entries(a.configSchema.properties)) {
      if (!properties[key]) properties[key] = prop;
    }
    (a.configSchema.required ?? []).forEach((r) => required.add(r));
  }
  return { type: 'object', properties, required: Array.from(required) };
}

// Only include a key if the user actually touched that field — leaving a
// field untouched means "don't send it" (relevant for optional
// strategy-level overrides layered on top of the channel's own config, and
// for edit forms where blank = "keep the current value").
function buildConfigPayload(schema: ConfigSchema, values: ConfigValues): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!(key in values)) continue;
    const raw = values[key];
    if (prop.type === 'boolean') {
      result[key] = Boolean(raw);
    } else if (raw !== '' && raw !== undefined) {
      result[key] = prop.type === 'number' ? Number(raw) : raw;
    }
  }
  return result;
}

function ConfigFieldsForm({
  schema,
  values,
  onChange,
  markRequired = true,
}: {
  schema: ConfigSchema;
  values: ConfigValues;
  onChange: (key: string, value: string | boolean) => void;
  markRequired?: boolean;
}) {
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) {
    return <p className="muted">Kênh này không cần thông tin cấu hình thêm.</p>;
  }
  return (
    <>
      {entries.map(([key, prop]) => {
        const isRequired = markRequired && (schema.required ?? []).includes(key);
        const label = `${prop.title}${isRequired ? ' *' : ''}`;

        if (prop.type === 'boolean') {
          return (
            <label key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={Boolean(values[key])} onChange={(e) => onChange(key, e.target.checked)} />
              {label}
            </label>
          );
        }

        const isMultiline = /template|html|body/i.test(key) || /template|html|body/i.test(prop.title);
        const inputType = prop.type === 'number' ? 'number' : prop.secret ? 'password' : 'text';

        return (
          <label key={key} style={isMultiline ? { gridColumn: '1 / -1' } : undefined}>
            {label}
            {isMultiline ? (
              <textarea
                rows={3}
                value={(values[key] as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                required={isRequired}
              />
            ) : (
              <input
                type={inputType}
                value={(values[key] as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                required={isRequired}
                autoComplete={prop.secret ? 'new-password' : 'off'}
              />
            )}
            {prop.description && (
              <span className="muted" style={{ fontSize: '0.76rem', fontWeight: 400 }}>
                {prop.description}
              </span>
            )}
          </label>
        );
      })}
    </>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [channelType, setChannelType] = useState('email');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [configValues, setConfigValues] = useState<ConfigValues>({});
  const [showTestChannels, setShowTestChannels] = useState(false);

  const [strategyKeyByChannel, setStrategyKeyByChannel] = useState<Record<string, string>>({});
  const [strategyConfigValuesByChannel, setStrategyConfigValuesByChannel] = useState<Record<string, ConfigValues>>({});
  const canManage = hasRole('admin');

  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editConfigValues, setEditConfigValues] = useState<ConfigValues>({});

  const [editingStrategyRowKey, setEditingStrategyRowKey] = useState<string | null>(null);
  const [editStrategyActive, setEditStrategyActive] = useState(true);
  const [editStrategyConfigValues, setEditStrategyConfigValues] = useState<ConfigValues>({});

  async function load() {
    try {
      const [c, a] = await Promise.all([api.get<ChannelView[]>('/channels'), api.get<AdapterInfo[]>('/channels/adapters')]);
      setChannels(c);
      setAdapters(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const channelTypeSchema = mergeSchemasForChannelType(channelType, adapters);
  const visibleChannels = showTestChannels
    ? channels
    : channels.filter((c) => c.channelType !== 'mock' && c.isActive);

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parsedConfig = buildConfigPayload(channelTypeSchema, configValues);
      await api.post('/channels', { channelType, name, provider, config: parsedConfig });
      setName('');
      setConfigValues({});
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStrategy(channelId: string, fallbackStrategyKey?: string) {
    setError(null);
    try {
      const strategyKey = strategyKeyByChannel[channelId] ?? fallbackStrategyKey;
      const adapter = adapters.find((a) => a.strategyKey === strategyKey);
      const values = strategyConfigValuesByChannel[channelId] ?? {};
      const config = adapter ? buildConfigPayload(adapter.configSchema, values) : {};
      await api.post(`/channels/${channelId}/strategies`, { strategyKey, config });
      setStrategyConfigValuesByChannel({ ...strategyConfigValuesByChannel, [channelId]: {} });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function testConnection(strategyId: string) {
    setError(null);
    try {
      const result = await api.post<{ valid: boolean; error?: string }>(
        `/channels/strategies/${strategyId}/test-connection`,
        {},
      );
      alert(result.valid ? 'Connection OK' : `Failed: ${result.error}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEditChannel(c: ChannelView) {
    setEditingChannelId(c.id);
    setEditName(c.name);
    setEditProvider(c.provider);
    setEditActive(c.isActive);
    setEditConfigValues({});
  }

  function cancelEditChannel() {
    setEditingChannelId(null);
  }

  async function saveEditChannel(c: ChannelView) {
    setError(null);
    try {
      const schema = mergeSchemasForChannelType(c.channelType, adapters);
      const config = buildConfigPayload(schema, editConfigValues);
      await api.patch(`/channels/${c.id}`, { name: editName, provider: editProvider, isActive: editActive, config });
      setEditingChannelId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteChannel(c: ChannelView) {
    if (!confirm(`Xoá channel "${c.name}"? Nếu đã được dùng, hệ thống sẽ tự động deactivate thay vì xoá hẳn.`)) return;
    setError(null);
    try {
      const result = await api.delete<MutationOutcome>(`/channels/${c.id}`);
      alert(outcomeMessage(result, 'Đã xoá channel.', 'Channel đang được dùng nên đã chuyển sang Inactive thay vì xoá.'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // 'mock' channels only ever existed to test the failover engine — one
  // click clears out all of them instead of deleting each by hand.
  async function cleanupMockChannels() {
    const mockChannels = channels.filter((c) => c.channelType === 'mock');
    if (mockChannels.length === 0) return;
    if (!confirm(`Xoá ${mockChannels.length} channel test/mock? Cái nào đang được dùng trong policy sẽ chuyển Inactive thay vì xoá hẳn.`)) {
      return;
    }
    setError(null);
    let deletedCount = 0;
    let deactivatedCount = 0;
    for (const c of mockChannels) {
      try {
        const result = await api.delete<MutationOutcome>(`/channels/${c.id}`);
        if (result.deleted) deletedCount++;
        else deactivatedCount++;
      } catch (e) {
        setError((e as Error).message);
      }
    }
    alert(`Đã xoá ${deletedCount} channel${deactivatedCount > 0 ? `, chuyển ${deactivatedCount} channel sang Inactive (đang được dùng trong policy)` : ''}.`);
    await load();
  }

  function startEditStrategy(channelId: string, s: StrategyView) {
    setEditingStrategyRowKey(`${channelId}:${s.id}`);
    setEditStrategyActive(s.isActive);
    setEditStrategyConfigValues({});
  }

  function cancelEditStrategy() {
    setEditingStrategyRowKey(null);
  }

  async function saveEditStrategy(channelId: string, s: StrategyView) {
    setError(null);
    try {
      const adapter = adapters.find((a) => a.strategyKey === s.strategyKey);
      const config = adapter ? buildConfigPayload(adapter.configSchema, editStrategyConfigValues) : {};
      await api.patch(`/channels/${channelId}/strategies/${s.id}`, { isActive: editStrategyActive, config });
      setEditingStrategyRowKey(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteStrategy(channelId: string, s: StrategyView) {
    if (!confirm(`Xoá strategy "${s.strategyKey}"?`)) return;
    setError(null);
    try {
      const result = await api.delete<MutationOutcome>(`/channels/${channelId}/strategies/${s.id}`);
      alert(outcomeMessage(result, 'Đã xoá strategy.', 'Strategy đang được dùng nên đã chuyển sang Inactive thay vì xoá.'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Channels</h1>
      {error && <p className="error">{error}</p>}

      {!canManage && <p className="muted">Chỉ admin mới có thể tạo/sửa channel. Bạn đang xem ở chế độ chỉ đọc.</p>}

      {canManage && (
        <>
          <h2>Add a channel</h2>
          <form onSubmit={createChannel} style={{ maxWidth: 860 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              <label>
                Channel type
                <select
                  value={channelType}
                  onChange={(e) => {
                    setChannelType(e.target.value);
                    setConfigValues({});
                  }}
                >
                  {CHANNEL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zalo OA - Marketing" required />
              </label>
              <label>
                Provider
                <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. smtp, esms, meta" required />
              </label>
            </div>

            <div
              style={{
                marginTop: '0.85rem',
                padding: '0.75rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.65rem',
                alignItems: 'start',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                Thông tin cấu hình cho &quot;{channelType}&quot;
              </strong>
              {channelType === 'email' && (
                <button
                  type="button"
                  className="secondary"
                  style={{ justifySelf: 'flex-start', gridColumn: '1 / -1' }}
                  onClick={() => setConfigValues({ ...configValues, host: 'smtp.gmail.com', port: '587', secure: false })}
                >
                  Dùng Gmail (điền sẵn Host/Port)
                </button>
              )}
              <ConfigFieldsForm
                schema={channelTypeSchema}
                values={configValues}
                onChange={(key, value) => setConfigValues({ ...configValues, [key]: value })}
              />
            </div>

            <button type="submit" style={{ marginTop: '0.75rem' }}>
              Create channel
            </button>
          </form>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <h2 style={{ margin: 0 }}>Configured channels</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem', fontWeight: 400 }}>
            <input type="checkbox" checked={showTestChannels} onChange={(e) => setShowTestChannels(e.target.checked)} />
            Hiện cả channel test/mock &amp; đã tắt
          </label>
          {canManage && channels.some((c) => c.channelType === 'mock') && (
            <button type="button" className="secondary" onClick={cleanupMockChannels}>
              Dọn dẹp channel mock
            </button>
          )}
        </div>
      </div>
      {channels.length === 0 && <p className="muted">Chưa có channel nào. Tạo channel đầu tiên ở form phía trên.</p>}
      {channels.length > 0 && visibleChannels.length === 0 && (
        <p className="muted">Không có channel nào để hiển thị — bật &quot;Hiện cả channel test/mock &amp; đã tắt&quot; để xem.</p>
      )}
      {visibleChannels.map((c) => {
        const strategyOptions = adapters.filter((a) => a.channelType === c.channelType);
        const selectedStrategyKey = strategyKeyByChannel[c.id] ?? strategyOptions[0]?.strategyKey;
        const selectedAdapter = strategyOptions.find((a) => a.strategyKey === selectedStrategyKey);
        const isEditingChannel = editingChannelId === c.id;

        return (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.3rem' }}>{CHANNEL_ICONS[c.channelType] ?? '📡'}</span>
                <div>
                  <strong>{c.name}</strong>{' '}
                  <span className="muted">
                    {c.channelType} · {c.provider}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`badge ${c.isActive ? 'badge-active' : 'badge-inactive'}`}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
                {canManage && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => (isEditingChannel ? cancelEditChannel() : startEditChannel(c))}
                    >
                      {isEditingChannel ? 'Cancel' : 'Edit'}
                    </button>
                    <button type="button" className="secondary" onClick={() => deleteChannel(c)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditingChannel ? (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                  <label>
                    Name
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                  </label>
                  <label>
                    Provider
                    <input value={editProvider} onChange={(e) => setEditProvider(e.target.value)} required />
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.45rem', justifyContent: 'flex-start' }}>
                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                    Active
                  </label>
                </div>
                <span className="muted" style={{ fontSize: '0.76rem', display: 'block', margin: '0.6rem 0' }}>
                  Chỉ điền field cấu hình muốn đổi — để trống sẽ giữ nguyên giá trị hiện tại.
                </span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.6rem',
                    alignItems: 'start',
                  }}
                >
                  {c.channelType === 'email' && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ justifySelf: 'flex-start', gridColumn: '1 / -1' }}
                      onClick={() =>
                        setEditConfigValues({ ...editConfigValues, host: 'smtp.gmail.com', port: '587', secure: false })
                      }
                    >
                      Dùng Gmail (điền sẵn Host/Port)
                    </button>
                  )}
                  <ConfigFieldsForm
                    schema={mergeSchemasForChannelType(c.channelType, adapters)}
                    values={editConfigValues}
                    onChange={(key, value) => setEditConfigValues({ ...editConfigValues, [key]: value })}
                    markRequired={false}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <button type="button" onClick={() => saveEditChannel(c)}>
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={cancelEditChannel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: '0.5rem' }}>
                Config: <code className="gz-code-block" style={{ padding: '0.1rem 0.4rem' }}>{c.configPreview || '(none)'}</code>
              </div>
            )}

            <hr className="gz-section-divider" />

            <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem', color: 'var(--text-muted)' }}>
              Strategies {c.strategies.length > 0 && `(${c.strategies.length})`}
            </h3>
            {c.strategies.length === 0 && <p className="muted">Chưa có strategy nào.</p>}
            {c.strategies.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {c.strategies.map((s) => {
                  const rowKey = `${c.id}:${s.id}`;
                  const isEditingStrategy = editingStrategyRowKey === rowKey;
                  const strategyAdapter = adapters.find((a) => a.strategyKey === s.strategyKey);
                  return (
                    <div key={s.id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--surface-hover)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '0.45rem 0.7rem',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.strategyKey}</span>
                          {!s.isActive && (
                            <span className="badge badge-inactive" style={{ fontSize: '0.65rem' }}>
                              Inactive
                            </span>
                          )}
                        </span>
                        {canManage && (
                          <span style={{ display: 'flex', gap: '0.4rem' }}>
                            <button type="button" className="secondary" onClick={() => testConnection(s.id)}>
                              Test connection
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => (isEditingStrategy ? cancelEditStrategy() : startEditStrategy(c.id, s))}
                            >
                              {isEditingStrategy ? 'Cancel' : 'Edit'}
                            </button>
                            <button type="button" className="secondary" onClick={() => deleteStrategy(c.id, s)}>
                              Delete
                            </button>
                          </span>
                        )}
                      </div>
                      {isEditingStrategy && (
                        <div
                          style={{
                            marginTop: '0.4rem',
                            padding: '0.6rem 0.7rem',
                            background: 'var(--bg)',
                            border: '1px dashed var(--border-strong)',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
                            <input
                              type="checkbox"
                              checked={editStrategyActive}
                              onChange={(e) => setEditStrategyActive(e.target.checked)}
                            />
                            Active
                          </label>
                          {strategyAdapter && Object.keys(strategyAdapter.configSchema.properties).length > 0 && (
                            <ConfigFieldsForm
                              schema={strategyAdapter.configSchema}
                              values={editStrategyConfigValues}
                              onChange={(key, value) =>
                                setEditStrategyConfigValues({ ...editStrategyConfigValues, [key]: value })
                              }
                              markRequired={false}
                            />
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" onClick={() => saveEditStrategy(c.id, s)}>
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={cancelEditStrategy}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canManage && strategyOptions.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'var(--bg)',
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 8,
                }}
              >
                <label style={{ minWidth: 200 }}>
                  Add strategy
                  <select
                    value={selectedStrategyKey ?? ''}
                    onChange={(e) => {
                      setStrategyKeyByChannel({ ...strategyKeyByChannel, [c.id]: e.target.value });
                      setStrategyConfigValuesByChannel({ ...strategyConfigValuesByChannel, [c.id]: {} });
                    }}
                  >
                    {strategyOptions.map((a) => (
                      <option key={a.strategyKey} value={a.strategyKey}>
                        {a.strategyKey}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedAdapter && Object.keys(selectedAdapter.configSchema.properties).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: '1 1 240px' }}>
                    <span className="muted" style={{ fontSize: '0.76rem' }}>
                      Override riêng cho strategy này (không bắt buộc — để trống sẽ dùng cấu hình chung của channel ở trên)
                    </span>
                    <ConfigFieldsForm
                      schema={selectedAdapter.configSchema}
                      values={strategyConfigValuesByChannel[c.id] ?? {}}
                      onChange={(key, value) =>
                        setStrategyConfigValuesByChannel({
                          ...strategyConfigValuesByChannel,
                          [c.id]: { ...(strategyConfigValuesByChannel[c.id] ?? {}), [key]: value },
                        })
                      }
                      markRequired={false}
                    />
                  </div>
                )}

                <button type="button" onClick={() => addStrategy(c.id, strategyOptions[0]?.strategyKey)}>
                  Add
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
