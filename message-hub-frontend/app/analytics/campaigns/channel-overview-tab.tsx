'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';

interface Summary {
  totalRequests: number;
  delivered: number;
  failed: number;
  inProgress: number;
  pending: number;
  chainReachRate: number;
}

interface ChannelStat {
  channelId: string;
  channelName: string;
  channelType: string;
  strategyKey: string;
  totalAttempts: number;
  succeeded: number;
  failed: number;
  deliveryRate: number;
}

interface Alert {
  id: string;
  severity: string;
  message: string;
  failureRate: number;
  sampleSize: number;
  createdAt: string;
  acknowledgedAt?: string;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ChannelOverviewTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [s, c, a] = await Promise.all([
        api.get<Summary>('/analytics/summary'),
        api.get<ChannelStat[]>('/analytics/channel-stats'),
        api.get<Alert[]>('/alerts'),
      ]);
      setSummary(s);
      setChannelStats(c);
      setAlerts(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function acknowledge(id: string) {
    await api.post(`/alerts/${id}/acknowledge`, {});
    await load();
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <h2 style={{ marginTop: 0 }}>Overview</h2>
      {summary && (
        <div className="card" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div className="muted">Total requests</div>
            <strong style={{ fontSize: '1.4rem' }}>{summary.totalRequests}</strong>
          </div>
          <div>
            <div className="muted">Delivered</div>
            <strong style={{ fontSize: '1.4rem', color: 'var(--gz-green-dark)' }}>{summary.delivered}</strong>
          </div>
          <div>
            <div className="muted">Failed</div>
            <strong style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>{summary.failed}</strong>
          </div>
          <div>
            <div className="muted">In progress</div>
            <strong style={{ fontSize: '1.4rem', color: 'var(--warning)' }}>{summary.inProgress}</strong>
          </div>
          <div>
            <div className="muted">Chain-reach rate (% cần failover)</div>
            <strong style={{ fontSize: '1.4rem' }}>{pct(summary.chainReachRate)}</strong>
          </div>
        </div>
      )}

      <h2>Delivery rate per channel strategy</h2>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Strategy</th>
            <th>Attempts</th>
            <th>Succeeded</th>
            <th>Failed</th>
            <th>Delivery rate</th>
          </tr>
        </thead>
        <tbody>
          {channelStats.map((c) => (
            <tr key={`${c.channelId}-${c.strategyKey}`}>
              <td>
                {c.channelName} <span className="muted">({c.channelType})</span>
              </td>
              <td className="muted">{c.strategyKey}</td>
              <td>{c.totalAttempts}</td>
              <td>{c.succeeded}</td>
              <td>{c.failed}</td>
              <td>{pct(c.deliveryRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Alerts</h2>
      {alerts.length === 0 && <p className="muted">Chưa có alert nào.</p>}
      {alerts.map((a) => (
        <div className="card" key={a.id} style={{ opacity: a.acknowledgedAt ? 0.5 : 1 }}>
          <span className={`badge badge-${a.severity === 'critical' ? 'failed' : 'pending'}`}>{a.severity}</span>{' '}
          {a.message}
          <div className="muted">{new Date(a.createdAt).toLocaleString()}</div>
          {!a.acknowledgedAt && (
            <button className="secondary" onClick={() => acknowledge(a.id)} style={{ marginTop: '0.5rem' }}>
              Acknowledge
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
