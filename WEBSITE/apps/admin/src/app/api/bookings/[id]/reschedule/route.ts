import { z } from 'zod';
import { DateTime } from 'luxon';
import { getBooking, getSettings, listCrews, rescheduleBooking } from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';
const Schema = z.object({ startLocal: z.string().min(10), crewId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Pick a new time and crew.');

  return guard(async (user) => {
    const booking = await getBooking(params.id);
    if (!booking) return { ok: false, error: 'Booking not found' };
    const settings = await getSettings();
    const crews = await listCrews(true);
    const tz = booking.schedule.timezone || settings.business.timezone;
    const newStart = DateTime.fromISO(parsed.data.startLocal, { zone: tz }).toMillis();
    if (!Number.isFinite(newStart)) return { ok: false, error: 'That is not a valid date and time.' };

    const result = await rescheduleBooking({
      booking, newStart, crews,
      settings: settings.scheduling, timezone: tz,
      forceCrewId: parsed.data.crewId,
    });

    if (!result.ok) {
      const crewName = crews.find((c) => c.id === parsed.data.crewId)?.name ?? 'That crew';
      return {
        ok: false,
        error: result.reason === 'crew_unavailable'
          ? `${crewName} can't take that slot — it would break the ${settings.scheduling.travelBufferMinutes}-minute travel buffer, or it falls outside their working hours.`
          : 'No crew is available at that time.',
      };
    }

    await logAction(user, 'Rescheduled', 'booking', booking.id,
      `${DateTime.fromMillis(newStart, { zone: tz }).toFormat('LLL d HH:mm')} · ${result.crewName}`);
    return {};
  });
}
