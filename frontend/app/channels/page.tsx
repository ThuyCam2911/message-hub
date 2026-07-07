'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

interface AdapterInfo {
  strategyKey: string;
  channelType: string;
  identifierKind: string;
  configSchema: { properties: Record<string, { title: string; secret?: boolean }> };
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

const CHANNEL_TYPES = ['zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock'];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [channelType, setChannelType] = useState('mock');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('mock');
  const [config, setConfig] = useState('{}');

  const [strategyKeyByChannel, setStrategyKeyByChannel] = useState<Record<string, string>>({});
  const [strategyConfigByChannel, setStrategyConfigByChannel] = useState<Record<string, string>>({});

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

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parsedConfig = JSON.parse(config || '{}');
      await api.post('/channels', { channelType, name, provider, config: parsedConfig });
      setName('');
      setConfig('{}');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStrategy(channelId: string) {
    setError(null);
    try {
      const strategyKey = strategyKeyByChannel[channelId] ?? adapters[0]?.strategyKey;
      const rawConfig = strategyConfigByChannel[channelId] ?? '{}';
      await api.post(`/channels/${channelId}/strategies`, {
        strategyKey,
        config: JSON.parse(rawConfig || '{}'),
      });
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

      <h2>Add a channel</h2>
      <form onSubmit={createChannel}>
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
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zalo OA - Marketing" required />
        </label>
        <label>
          Provider
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. mock, smtp, esms" required />
        </label>
        <label>
          Config (JSON credentials)
          <textarea rows={4} value={config} onChange={(e) => setConfig(e.target.value)} />
        </label>
        <button type="submit">Create channel</button>
      </form>

      <h2>Configured channels</h2>
      {channels.map((c) => (
        <div className="card" key={c.id}>
          <strong>{c.name}</strong> <span className="muted">({c.channelType} / {c.provider})</span>
          <div className="muted">config preview: {c.configPreview || '(none)'}</div>

          <h3 style={{ fontSize: '0.9rem', marginTop: '0.75rem' }}>Strategies</h3>
          {c.strategies.length === 0 && <p className="muted">No strategies yet.</p>}
          <ul>
            {c.strategies.map((s) => (
              <li key={s.id}>
                {s.strategyKey}{' '}
                <button type="button" className="secondary" onClick={() => testConnection(s.id)}>
                  Test connection
                </button>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
            <label>
              Add strategy
              <select
                value={strategyKeyByChannel[c.id] ?? adapters[0]?.strategyKey ?? ''}
                onChange={(e) => setStrategyKeyByChannel({ ...strategyKeyByChannel, [c.id]: e.target.value })}
              >
                {adapters.map((a) => (
                  <option key={a.strategyKey} value={a.strategyKey}>
                    {a.strategyKey}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Strategy config (JSON)
              <input
                value={strategyConfigByChannel[c.id] ?? '{}'}
                onChange={(e) => setStrategyConfigByChannel({ ...strategyConfigByChannel, [c.id]: e.target.value })}
              />
            </label>
            <button type="button" onClick={() => addStrategy(c.id)}>
              Add
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
