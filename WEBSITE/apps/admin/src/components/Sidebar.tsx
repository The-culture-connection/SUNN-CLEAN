'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS: { label: string; items: [string, string, string][] }[] = [
  { label: 'Operations', items: [
    ['/', '◧', 'Dashboard'],
    ['/schedule', '▦', 'Schedule'],
    ['/bookings', '☰', 'Bookings'],
  ] },
  { label: 'Money', items: [
    ['/invoices', '$', 'Invoices'],
    ['/payouts', '◈', 'Payouts'],
  ] },
  { label: 'Content', items: [
    ['/reviews', '★', 'Reviews'],
    ['/gallery', '▣', 'Before & After'],
    ['/certifications', '✓', 'Certifications'],
    ['/messages', '✉', 'Messages'],
  ] },
  { label: 'Setup', items: [
    ['/crews', '◉', 'Crews'],
    ['/catalog', '⊞', 'Services & Add-ons'],
    ['/pricing', '％', 'Surcharges & Types'],
    ['/settings', '⚙', 'Settings'],
  ] },
];

export function Sidebar({ unread, pendingReviews }: { unread: number; pendingReviews: number }) {
  const path = usePathname();
  return (
    <aside className="side">
      <div className="sbrand">
        <img src="/logo-mark.png" alt="" />
        <div><b>SUNN CLEAN</b><span>ADMIN PORTAL</span></div>
      </div>
      <nav className="snav">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="lbl">{g.label}</div>
            {g.items.map(([href, icon, label]) => {
              const active = href === '/' ? path === '/' : path.startsWith(href);
              const count = href === '/' ? unread : href === '/reviews' ? pendingReviews : 0;
              return (
                <Link key={href} href={href} className={active ? 'on' : ''}>
                  <span className="ic" aria-hidden>{icon}</span>{label}
                  {count > 0 && <span className="cnt">{count}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
