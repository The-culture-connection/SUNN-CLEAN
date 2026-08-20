import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@sunnclean/shared';
import { Header, Footer } from '@/components/Chrome';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  const name = s?.business.displayName ?? 'SUNN CLEAN';
  return {
    title: { default: `${name} — Commercial Cleaning Services`, template: `%s · ${name}` },
    description: s?.content.heroSubhead ?? 'Commercial cleaning you can book online.',
    icons: { icon: '/icon.png' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Header settings={settings} />
        <main id="main">{children}</main>
        <Footer settings={settings} />
      </body>
    </html>
  );
}
