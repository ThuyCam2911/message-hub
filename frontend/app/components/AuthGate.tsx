'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { clearSession, getCurrentUser, getToken } from '../lib/auth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === '/login') {
      setReady(true);
      return;
    }
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    setReady(true);
  }, [pathname]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (!ready) {
    return null;
  }

  const user = getCurrentUser();

  function logout() {
    clearSession();
    window.location.href = '/login';
  }

  return (
    <>
      <nav>
        <Link href="/">Message Hub</Link>
        <Link href="/channels">Channels</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/contacts">Contacts</Link>
        <Link href="/failover-policies">Failover Policies</Link>
        <Link href="/campaigns">Campaigns</Link>
        <Link href="/send-test">Send Test</Link>
        <Link href="/messages">Messages</Link>
        <Link href="/analytics">Analytics</Link>
        {user?.role === 'admin' && <Link href="/audit-log">Audit Log</Link>}
        <span style={{ marginLeft: 'auto', color: '#9aa4b2', fontSize: '0.85rem' }}>
          {user?.email} ({user?.role})
        </span>
        <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>
          Logout
        </a>
      </nav>
      {children}
    </>
  );
}
