'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api-client';

interface Campaign {
  id: string;
  name: string;
  status: string;
  templateId: string;
  failoverPolicyId: string;
  progress: { total: number; delivered: number; failed: number; inProgress: number };
}

interface CampaignMessageRequest {
  id: string;
  status: string;
  contactId: string;
  contactName: string;
  finalChannelStrategyId?: string;
  createdAt: string;
  completedAt?: string;
}

interface Attempt {
  id: string;
  channelStrategyId: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [requests, setRequests] = useState<CampaignMessageRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Attempt[]>>({});

  async function load() {
    try {
      const [c, r] = await Promise.all([
        api.get<Campaign>(`/campaigns/${id}`),
        api.get<CampaignMessageRequest[]>(`/campaigns/${id}/message-requests`),
      ]);
      setCampaign(c);
      setRequests(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleExpand(requestId: string) {
    if (expandedId === requestId) {
      setExpandedId(null);
      return;
    }
    try {
      const full = await api.get<{ attempts: Attempt[] }>(`/message-requests/${requestId}`);
      setDetail((prev) => ({ ...prev, [requestId]: full.attempts }));
      setExpandedId(requestId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!campaign) {
    return (
      <div>
        <Link href="/campaigns">&larr; Campaigns</Link>
        {error && <p className="error">{error}</p>}
        {!error && <p className="muted">Đang tải...</p>}
      </div>
    );
  }

  const { progress } = campaign;
  const deliveryRate = progress.total > 0 ? Math.round((progress.delivered / progress.total) * 100) : 0;

  return (
    <div>
      <Link href="/campaigns" className="muted" style={{ textDecoration: 'none' }}>
        &larr; Campaigns
      </Link>
      <h1 style={{ marginTop: '0.4rem' }}>{campaign.name}</h1>
      <span className={`badge badge-${campaign.status === 'running' ? 'in_progress' : campaign.status}`}>
        {campaign.status}
      </span>
      {error && <p className="error">{error}</p>}

      <div className="gz-stat-grid" style={{ marginTop: '1rem' }}>
        <div className="gz-stat-card">
          <span className="muted">Tổng recipients</span>
          <div className="value">{progress.total}</div>
        </div>
        <div className="gz-stat-card">
          <span className="muted">Delivered</span>
          <div className="value" style={{ color: 'var(--gz-green-dark)' }}>
            {progress.delivered}
          </div>
        </div>
        <div className="gz-stat-card">
          <span className="muted">Failed</span>
          <div className="value" style={{ color: 'var(--danger)' }}>
            {progress.failed}
          </div>
        </div>
        <div className="gz-stat-card">
          <span className="muted">Đang xử lý</span>
          <div className="value" style={{ color: 'var(--warning)' }}>
            {progress.inProgress}
          </div>
        </div>
        <div className="gz-stat-card">
          <span className="muted">Delivery rate</span>
          <div className="value gz-gradient-text">{deliveryRate}%</div>
        </div>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Recipients ({requests.length})</h2>
      {requests.length === 0 && <p className="muted">Campaign chưa được trigger, hoặc chưa có recipient nào.</p>}
      {requests.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Status</th>
              <th>Created</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td>{r.contactName}</td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="muted">{r.completedAt ? new Date(r.completedAt).toLocaleString() : '-'}</td>
                  <td>
                    <button className="secondary" onClick={() => toggleExpand(r.id)}>
                      {expandedId === r.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expandedId === r.id && detail[r.id] && (
                  <tr>
                    <td colSpan={5}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Channel strategy</th>
                            <th>Status</th>
                            <th>Error</th>
                            <th>Sent at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail[r.id].map((a, i) => (
                            <tr key={a.id}>
                              <td>{i}</td>
                              <td className="muted">{a.channelStrategyId.slice(0, 8)}</td>
                              <td>
                                <Badge status={a.status} />
                              </td>
                              <td className="muted">{a.errorCode ? `${a.errorCode}: ${a.errorMessage ?? ''}` : ''}</td>
                              <td className="muted">{a.sentAt ? new Date(a.sentAt).toLocaleTimeString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
