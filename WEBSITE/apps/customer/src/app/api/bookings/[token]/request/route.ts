import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findBookingByLookupHash, hashToken, notify, updateBooking } from '@sunnclean/shared';
import { bad, clientIp, rateLimit } from '@/lib/api';

export const dynamic = 'force-dynamic';
const Schema = z.object({ kind: z.enum(['reschedule', 'cancel']), note: z.string().max(1000).default('') });

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!rateLimit(`req:${clientIp(req)}`, 10, 3600_000)) return bad('Too many requests', 429);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Invalid request', 400);

  const booking = await findBookingByLookupHash(hashToken(params.token));
  if (!booking) return bad('Booking not found', 404);

  const isCancel = parsed.data.kind === 'cancel';
  await updateBooking(booking.id, {
    requests: {
      cancellationRequested: isCancel || booking.requests.cancellationRequested,
      rescheduleRequested: !isCancel || booking.requests.rescheduleRequested,
      requestNote: parsed.data.note,
      requestedAt: Date.now(),
    },
  });

  await notify({
    id: `${parsed.data.kind}_${booking.id}`,
    type: isCancel ? 'cancellation_requested' : 'reschedule_requested',
    severity: 'action',
    title: `${isCancel ? 'Cancellation' : 'Reschedule'} requested — ${booking.customer.businessName || booking.customer.contactName}`,
    body: parsed.data.note || booking.bookingNumber,
    link: `/bookings/${booking.id}`,
    relatedId: booking.id,
  });

  return NextResponse.json({ ok: true });
}
