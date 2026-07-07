import type { Metadata } from 'next';
import './globals.css';
import AuthGate from './components/AuthGate';

export const metadata: Metadata = {
  title: 'Message Hub',
  description: 'GiftZone multi-channel messaging portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <main>{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
