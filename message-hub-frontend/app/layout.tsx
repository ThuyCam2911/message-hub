import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import AuthGate from './components/AuthGate';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Message Hub — GiftZone',
  description: 'GiftZone multi-channel messaging portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={beVietnamPro.variable}>
      <body>
        <AuthGate>
          <main>{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
