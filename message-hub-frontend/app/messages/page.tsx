'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api-client';
import { getSocket } from '../lib/ws-client';

interface Attempt {
  id: string;
  channelStrategyId: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

interface MessageRequest {
  id: string;
  status: string;
  currentStepOrder?: number;
  finalChannelStrategyId?: string;
  createdAt: string;
  completedAt?: string;
}

function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function MessagesPage() {
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [detail, setDetail] = useState<Record<string, (MessageRequest & { attempts: Attempt[] }) | undefined>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const expandedIdRef = useRef<string | null>(null);

  async function load() {
    try {
      setRequests(await api.get<MessageRequest[]>('/message-requests'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshDetail(id: string) {
    const d = await api.get<MessageRequest & { attempts: Attempt[] }>(`/message-requests/${id}`);
    setDetail((prev) => ({ ...prev, [id]: d }));
  }

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    load();
    // 15s fallback poll in case the WebSocket connection drops; the socket
    // events below are what actually make the page feel live.
    const interval = setInterval(load, 15000);

    const socket = getSocket();
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);
    const onUpdate = (event: { messageRequestId: string }) => {
      load();
      if (expandedIdRef.current === event.messageRequestId) {
        refreshDetail(event.messageRequestId);
      }
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message-request-updated', onUpdate);
    socket.on('message-attempt-updated', onUpdate);
    setLive(socket.connected);

    return () => {
      clearInterval(interval);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message-request-updated', onUpdate);
      socket.off('message-attempt-updated', onUpdate);
    };
  }, []);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    await refreshDetail(id);
    setExpandedId(id);
  }

  return (
    <div>
      <h1>
        Messages{' '}
        <span className="muted" style={{ fontSize: '0.7rem' }}>
          {live ? '🟢 live' : '🔴 offline (đang dùng poll dự phòng)'}
        </span>
      </h1>
      {error && <p className="error">{error}</p>}
      <p className="muted">Cập nhật tức thời qua WebSocket. Click một dòng để xem chi tiết từng attempt trong chuỗi failover.</p>

      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Status</th>
            <th>Step</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <React.Fragment key={r.id}>
              <tr>
                <td>{r.id.slice(0, 8)}</td>
                <td>
                  <Badge status={r.status} />
                </td>
                <td>{r.currentStepOrder ?? '-'}</td>
                <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
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
                        {detail[r.id]!.attempts.map((a, i) => (
                          <tr key={a.id}>
                            <td>{i}</td>
                            <td className="muted">{a.channelStrategyId.slice(0, 8)}</td>
                            <td>
                              <Badge status={a.status} />
                            </td>
                            <td className="muted">
                              {a.errorCode ? `${a.errorCode}: ${a.errorMessage ?? ''}` : ''}
                            </td>
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
    </div>
  );
}
