import { z } from 'zod';
import { getBooking, updateBooking } from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';
const Schema = z.object({
  bookingIds: z.array(z.string().min(1)).min(1).max(200),
  paid: z.boolean(),
});

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Invalid request');

  return guard(async (user) => {
    for (const id of parsed.data.bookingIds) {
      const booking = await getBooking(id);
      if (!booking) continue;
      await updateBooking(id, {
        payout: {
          ...booking.payout,
          paid: parsed.data.paid,
          paidAt: parsed.data.paid ? Date.now() : undefined,
        },
      });
    }
    await logAction(user, parsed.data.paid ? 'Marked payout paid' : 'Marked payout unpaid',
      'payout', parsed.data.bookingIds[0], `${parsed.data.bookingIds.length} job(s)`);
    return {};
  });
}
