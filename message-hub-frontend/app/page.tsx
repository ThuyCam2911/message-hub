'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from './lib/api-client';

interface Summary {
  totalRequests: number;
  delivered: number;
  failed: number;
  inProgress: number;
  chainReachRate: number;
}

const QUICK_LINKS = [
  { href: '/channels', title: 'Channels', desc: 'Cấu hình kênh gửi & credentials' },
  { href: '/templates', title: 'Templates', desc: 'Soạn nội dung theo từng kênh' },
  { href: '/failover-policies', title: 'Failover Policies', desc: 'Dựng chuỗi failover tự động' },
  { href: '/campaigns', title: 'Campaigns', desc: 'Gửi hàng loạt, cá nhân hoá theo contact — gửi test trước khi publish' },
];

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get<Summary>('/analytics/summary')
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <div className="gz-hero">
        <Image src="/brand/logo-mark.png" alt="GiftZone" width={190} height={42} priority />
        <div>
          <h1 style={{ margin: 0 }}>Message Hub</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Portal gửi tin đa kênh &amp; failover tự động cho GiftZone
          </p>
        </div>
      </div>

      {summary && (
        <div className="gz-stat-grid">
          <div className="gz-stat-card">
            <span className="muted">Tổng messages</span>
            <div className="value">{summary.totalRequests}</div>
          </div>
          <div className="gz-stat-card">
            <span className="muted">Delivered</span>
            <div className="value" style={{ color: 'var(--gz-green-dark)' }}>
              {summary.delivered}
            </div>
          </div>
          <div className="gz-stat-card">
            <span className="muted">Failed</span>
            <div className="value" style={{ color: 'var(--danger)' }}>
              {summary.failed}
            </div>
          </div>
          <div className="gz-stat-card">
            <span className="muted">Đang xử lý</span>
            <div className="value" style={{ color: 'var(--warning)' }}>
              {summary.inProgress}
            </div>
          </div>
          <div className="gz-stat-card">
            <span className="muted">Chain-reach rate</span>
            <div className="value gz-gradient-text">{Math.round(summary.chainReachRate * 100)}%</div>
          </div>
        </div>
      )}

      <h2>Bắt đầu nhanh</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ height: '100%' }}>
              <strong style={{ color: 'var(--text)' }}>{link.title}</strong>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                {link.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
