import { z } from 'zod';
import { DateTime } from 'luxon';
import {
  bucket, getBooking, getCrew, getSettings, markComplete, updateBooking,
} from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  actualStart: z.string().min(10),
  actualEnd: z.string().min(10),
  crewNotes: z.string().max(4000).default(''),
  photos: z.array(z.string().startsWith('data:image/')).max(8).default([]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail('Please fill in the start and end times.');

  return guard(async (user) => {
    const booking = await getBooking(params.id);
    if (!booking) return { ok: false, error: 'Booking not found' };
    const settings = await getSettings();
    const tz = booking.schedule.timezone || settings.business.timezone;

    const start = DateTime.fromISO(parsed.data.actualStart, { zone: tz }).toMillis();
    const end = DateTime.fromISO(parsed.data.actualEnd, { zone: tz }).toMillis();
    if (!(end > start)) return { ok: false, error: 'The end time must be after the start time.' };

    // Upload photos first so markComplete can persist the paths in one write.
    const paths = [...(booking.completion?.photoPaths ?? [])];
    for (let i = 0; i < parsed.data.photos.length; i++) {
      const m = parsed.data.photos[i].match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m) continue;
      const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
      const path = `jobs/${booking.id}/${Date.now()}-${i}.${ext}`;
      await bucket().file(path).save(Buffer.from(m[2], 'base64'), { contentType: m[1] });
      paths.push(path);
    }
    if (paths.length !== (booking.completion?.photoPaths ?? []).length) {
      await updateBooking(booking.id, { completion: { ...booking.completion, photoPaths: paths } });
    }

    const fresh = await getBooking(params.id);
    const crew = await getCrew(booking.schedule.crewId);
    await markComplete({
      booking: fresh ?? booking,
      crew,
      actualStart: start,
      actualEnd: end,
      crewNotes: parsed.data.crewNotes,
      byUid: user.uid,
    });

    await logAction(user, 'Marked complete', 'booking', booking.id,
      `${((end - start) / 3_600_000).toFixed(2)}h`);
    return {};
  });
}
