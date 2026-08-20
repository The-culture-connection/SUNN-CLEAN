import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SUNN CLEAN Admin', template: '%s · SUNN CLEAN Admin' },
  icons: { icon: '/icon.png' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
