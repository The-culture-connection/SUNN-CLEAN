import { markAllNotificationsRead, markNotificationRead } from '@sunnclean/shared';
import { guard, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { action?: string; id?: string } | null;
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    if (body.action === 'read_all') await markAllNotificationsRead(user.uid);
    else if (body.id) await markNotificationRead(body.id, user.uid);
    return {};
  });
}
