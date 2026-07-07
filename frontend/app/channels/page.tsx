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

interface ChannelView {
  id: string;
  channelType: string;
  name: string;
  provider: string;
  isActive: boolean;
  configPreview: string;
  strategies: { id: string; strategyKey: string; adapterName: string; isActive: boolean }[];
}

type ConfigValues = Record<string, string | boolean>;

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

const CHANNEL_ICONS: Record<string, string> = {
  zbs: '🎫',
  sms: '💬',
  telegram: '✈️',
  line: '💚',
  whatsapp: '📞',
  email: '✉️',
  mock: '🧪',
};

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
// strategy-level overrides layered on top of the channel's own config).
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
          <label key={key}>
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

  const [channelType, setChannelType] = useState('mock');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('mock');
  const [configValues, setConfigValues] = useState<ConfigValues>({});

  const [strategyKeyByChannel, setStrategyKeyByChannel] = useState<Record<string, string>>({});
  const [strategyConfigValuesByChannel, setStrategyConfigValuesByChannel] = useState<Record<string, ConfigValues>>({});
  const canManage = hasRole('admin');

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

  async function addStrategy(channelId: string) {
    setError(null);
    try {
      const strategyKey = strategyKeyByChannel[channelId] ?? adapters[0]?.strategyKey;
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

  return (
    <div>
      <h1>Channels</h1>
      {error && <p className="error">{error}</p>}

      {!canManage && <p className="muted">Chỉ admin mới có thể tạo/sửa channel. Bạn đang xem ở chế độ chỉ đọc.</p>}

      {canManage && (
        <>
          <h2>Add a channel</h2>
          <form onSubmit={createChannel}>
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
              <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. mock, smtp, esms" required />
            </label>

            <div
              style={{
                marginTop: '0.4rem',
                padding: '0.75rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Thông tin cấu hình cho &quot;{channelType}&quot;
              </strong>
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

      <h2>Configured channels</h2>
      {channels.length === 0 && <p className="muted">Chưa có channel nào. Tạo channel đầu tiên ở form phía trên.</p>}
      {channels.map((c) => {
        const selectedStrategyKey = strategyKeyByChannel[c.id] ?? adapters[0]?.strategyKey;
        const selectedAdapter = adapters.find((a) => a.strategyKey === selectedStrategyKey);

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
              <span className={`badge ${c.isActive ? 'badge-active' : 'badge-inactive'}`}>
                {c.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="muted" style={{ marginTop: '0.5rem' }}>
              Config: <code className="gz-code-block" style={{ padding: '0.1rem 0.4rem' }}>{c.configPreview || '(none)'}</code>
            </div>

            <hr className="gz-section-divider" />

            <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem', color: 'var(--text-muted)' }}>
              Strategies {c.strategies.length > 0 && `(${c.strategies.length})`}
            </h3>
            {c.strategies.length === 0 && <p className="muted">Chưa có strategy nào.</p>}
            {c.strategies.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {c.strategies.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '0.45rem 0.7rem',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.strategyKey}</span>
                    {canManage && (
                      <button type="button" className="secondary" onClick={() => testConnection(s.id)}>
                        Test connection
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canManage && (
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
                    {adapters.map((a) => (
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

                <button type="button" onClick={() => addStrategy(c.id)}>
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
