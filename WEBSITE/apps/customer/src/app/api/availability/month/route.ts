import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { computeAvailability, datesToInspect, loadCrewDays } from '@sunnclean/shared';
import { QuoteSchema, loadEngineContext, durationFor, bad, clientIp, rateLimit } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Schema = QuoteSchema.extend({ month: z.string().regex(/^\d{4}-\d{2}$/) });

/** Slot counts per day so the calendar can grey out full days before a click. */
export async function POST(req: Request) {
  if (!rateLimit(`month:${clientIp(req)}`, 60, 60_000)) return bad('Too many requests', 429);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Invalid request', 400);

  const ctx = await loadEngineContext();
  const tz = ctx.settings.business.timezone;
  const duration = durationFor(ctx, parsed.data);
  if (!duration?.ok) return NextResponse.json({ days: {}, reason: duration?.reason ?? 'invalid' });

  const first = DateTime.fromISO(`${parsed.data.month}-01`, { zone: tz }).startOf('month');
  const last = first.endOf('month');
  const allDates: string[] = [];
  for (let d = first; d <= last; d = d.plus({ days: 1 })) allDates.push(d.toFormat('yyyy-MM-dd'));

  const probe = datesToInspect(first.minus({ days: 1 }).toMillis(), last.plus({ days: 1 }).toMillis(), tz);
  const crewDays = await loadCrewDays(ctx.crews.map((c) => c.id), probe);
  const blackoutDates = new Set(ctx.blackouts.map((b) => b.date));
  const now = Date.now();

  const days: Record<string, number> = {};
  for (const date of allDates) {
    const r = computeAvailability({
      date, durationMinutes: duration.minutes, crews: ctx.crews, crewDays,
      settings: ctx.settings.scheduling, timezone: tz, blackoutDates, now,
    });
    days[date] = r.slots.length;
  }
  return NextResponse.json({ days, timezone: tz, durationMinutes: duration.minutes });
}
