import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notify, saveContactMessage } from '@sunnclean/shared';
import { bad, clientIp, rateLimit } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  name: z.string().min(1).max(140),
  email: z.string().email().max(200),
  phone: z.string().max(40).default(''),
  message: z.string().min(5).max(4000),
  website: z.string().max(0).optional().or(z.literal('')),
});

export async function POST(req: Request) {
  if (!rateLimit(`contact:${clientIp(req)}`, 5, 3600_000)) {
    return bad('Too many messages. Please call us instead.', 429);
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Please complete the form.', 400);
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true });

  const id = await saveContactMessage({
    name: d.name.trim(), email: d.email.toLowerCase().trim(),
    phone: d.phone.trim(), message: d.message.trim(),
    handled: false, createdAt: Date.now(),
  });

  await notify({
    id: `contact_${id}`, type: 'contact_form', severity: 'info',
    title: `Contact form — ${d.name}`,
    body: d.message.slice(0, 140),
    link: '/messages', relatedId: id,
  });

  return NextResponse.json({ ok: true });
}
