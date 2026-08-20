import { cancelBooking, deleteNotificationsFor, getBooking } from '@sunnclean/shared';
import { guard, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return guard(async (user) => {
    const booking = await getBooking(params.id);
    if (!booking) return { ok: false, error: 'Booking not found' };
    await cancelBooking(booking, user.uid);
    // Clear any outstanding nudges for a job that is no longer happening.
    await Promise.all([
      deleteNotificationsFor(booking.id, 'job_needs_completion'),
      deleteNotificationsFor(booking.id, 'invoice_needed'),
      deleteNotificationsFor(booking.id, 'cancellation_requested'),
      deleteNotificationsFor(booking.id, 'reschedule_requested'),
    ]);
    await logAction(user, 'Cancelled', 'booking', booking.id, booking.bookingNumber);
    return {};
  });
}
