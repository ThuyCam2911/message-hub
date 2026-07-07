'use client';

import { useState } from 'react';
import Image from 'next/image';
import { setSession } from '../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Login failed');
      }
      const data = await res.json();
      setSession(data.accessToken, data.user);
      window.location.href = '/';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.25rem' }}>
          <Image src="/brand/logo-full.png" alt="GiftZone" width={280} height={69} priority />
        </div>

        <div
          className="card"
          style={{ padding: '1.75rem', boxShadow: 'var(--shadow-soft)', border: '1px solid var(--border-strong)' }}
        >
          <h1 style={{ fontSize: '1.15rem', marginBottom: '0.15rem' }}>Đăng nhập Message Hub</h1>
          <p className="muted" style={{ marginBottom: '1.25rem' }}>
            Portal gửi tin đa kênh nội bộ GiftZone
          </p>
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleSubmit} style={{ maxWidth: 'none', background: 'none', border: 'none', padding: 0 }}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: '0.25rem' }}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <p className="muted" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          A voucher distribution platform · Message Hub
        </p>
      </div>
    </div>
  );
}
