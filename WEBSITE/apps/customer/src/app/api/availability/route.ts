import { NextResponse } from 'next/server';
import { computeAvailability, datesToInspect, loadCrewDays } from '@sunnclean/shared';
import { QuoteSchema, loadEngineContext, durationFor, bad, clientIp, rateLimit } from '@/lib/api';
import { z } from 'zod';
import { DateTime } from 'luxon';

export const dynamic = 'force-dynamic';

const Schema = QuoteSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: Request) {
  if (!rateLimit(`avail:${clientIp(req)}`, 180, 60_000)) return bad('Too many requests', 429);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Invalid request', 400);

  const ctx = await loadEngineContext();
  const tz = ctx.settings.business.timezone;
  const duration = durationFor(ctx, parsed.data);
  if (!duration) return bad('That service is not available', 404);

  if (!duration.ok) {
    return NextResponse.json({
      date: parsed.data.date, timezone: tz,
      durationMinutes: duration.minutes, slots: [], reason: duration.reason,
    });
  }

  // Read the crew-day index for D-1 / D / D+1 across every active crew.
  const dayStart = DateTime.fromISO(parsed.data.date, { zone: tz }).startOf('day');
  const probe = datesToInspect(
    dayStart.toMillis(),
    dayStart.plus({ days: 1 }).toMillis(),
    tz,
  );
  const crewDays = await loadCrewDays(ctx.crews.map((c) => c.id), probe);

  const result = computeAvailability({
    date: parsed.data.date,
    durationMinutes: duration.minutes,
    crews: ctx.crews,
    crewDays,
    settings: ctx.settings.scheduling,
    timezone: tz,
    blackoutDates: new Set(ctx.blackouts.map((b) => b.date)),
    now: Date.now(),
  });

  return NextResponse.json(result);
}
