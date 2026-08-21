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

/** Turn the first validation failure into something a person can act on. */
function explain(error: z.ZodError): string {
  const issue = error.issues[0];
  switch (issue?.path[0]) {
    case 'name':    return 'Please tell us your name.';
    case 'email':   return 'Please enter a valid email address.';
    case 'phone':   return 'That phone number is too long.';
    case 'message': return issue.code === 'too_small'
      ? 'Please write a bit more — your message needs at least 5 characters.'
      : 'That message is too long.';
    default:        return 'Please complete the form.';
  }
}

export async function POST(req: Request) {
  if (!rateLimit(`contact:${clientIp(req)}`, 5, 3600_000)) {
    return bad('Too many messages. Please call us instead.', 429);
  }
  const raw: unknown = await req.json().catch(() => null);

  // Honeypot first. It has to be checked before validation, because a filled
  // honeypot fails the schema — which would answer a bot with a 400 and tell it
  // exactly which field gave it away.
  if (raw && typeof raw === 'object' && typeof (raw as { website?: unknown }).website === 'string'
      && (raw as { website: string }).website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return bad(explain(parsed.error), 400);
  const d = parsed.data;

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
