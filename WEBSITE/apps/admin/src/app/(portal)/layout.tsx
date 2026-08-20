import { requireUser } from '@/lib/auth';
import { listNotifications, listReviews } from '@sunnclean/shared';
import { Sidebar } from '@/components/Sidebar';
import { LogoutButton } from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Real verification happens HERE, not in middleware (see lib/auth.ts).
  const user = await requireUser();
  const [notifications, pendingReviews] = await Promise.all([
    listNotifications(80).catch(() => []),
    listReviews('pending').catch(() => []),
  ]);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="shell">
      <Sidebar unread={unread} pendingReviews={pendingReviews.length} />
      <div className="main">
        <div className="topbar">
          <strong style={{ color: 'var(--navy)' }}>SUNN CLEAN</strong>
          <div className="who">
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span title={user.email} className="avatar">
              {(user.name || user.email).slice(0, 2).toUpperCase()}
            </span>
            <LogoutButton />
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
