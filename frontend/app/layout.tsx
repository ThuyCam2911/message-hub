import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Message Hub',
  description: 'GiftZone multi-channel messaging portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Message Hub</Link>
          <Link href="/channels">Channels</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/contacts">Contacts</Link>
          <Link href="/failover-policies">Failover Policies</Link>
          <Link href="/send-test">Send Test</Link>
          <Link href="/messages">Messages</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
