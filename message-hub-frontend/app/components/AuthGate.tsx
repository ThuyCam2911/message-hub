'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { clearSession, getCurrentUser, getToken } from '../lib/auth';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/channels', label: 'Channels' },
  { href: '/templates', label: 'Templates' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/failover-policies', label: 'Failover Policies' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/analytics/campaigns', label: 'Analytics' },
];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Close the mobile menu automatically whenever the route changes, so it
  // doesn't stay open covering the new page after navigating.
  useEffect(() => {
    setMenuOpen(false);
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
      <header className="gz-topbar">
        <div className="gz-topbar-accent" />
        <nav>
          <Link href="/" className="gz-logo">
            <Image src="/brand/logo-mark.png" alt="GiftZone" width={120} height={26} priority />
          </Link>
          <button
            type="button"
            className="gz-menu-toggle"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          <div className={`gz-nav-links ${menuOpen ? 'open' : ''}`}>
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''}>
                {link.label}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link href="/audit-log" className={pathname === '/audit-log' ? 'active' : ''}>
                Audit Log
              </Link>
            )}
            <span className="gz-user-chip">
              <span className="gz-avatar">{user?.email?.[0]?.toUpperCase() ?? '?'}</span>
              {user?.email} · {user?.role}
            </span>
            <a
              href="#"
              className="gz-logout"
              onClick={(e) => {
                e.preventDefault();
                logout();
              }}
            >
              Logout
            </a>
          </div>
        </nav>
      </header>
      {children}
    </>
  );
}
