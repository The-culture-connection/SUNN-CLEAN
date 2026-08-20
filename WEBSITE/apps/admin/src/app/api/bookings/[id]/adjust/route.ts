import { z } from 'zod';
import { getBooking, retotal, updateBooking, type LineItem } from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';
const Schema = z.object({
  label: z.string().min(1).max(160),
  amount: z.coerce.number().finite(),
  reason: z.string().max(500).default(''),
});

/** Adjustments are ordinary line items so tax recalculates on the new subtotal. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Give the adjustment a label and an amount.');

  return guard(async (user) => {
    const booking = await getBooking(params.id);
    if (!booking) return { ok: false, error: 'Booking not found' };

    const item: LineItem = {
      key: `adjustment:${Date.now()}`,
      label: parsed.data.label,
      type: 'adjustment',
      amount: Math.round(parsed.data.amount * 100) / 100,
      note: parsed.data.reason || undefined,
      byUid: user.uid,
      at: Date.now(),
    };

    const lineItems = [...booking.pricing.lineItems, item];
    const totals = retotal(lineItems, booking.pricing.taxRate);

    await updateBooking(booking.id, {
      pricing: {
        ...booking.pricing,
        lineItems,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        finalTotal: totals.total,
      },
    });

    await logAction(user, 'Added adjustment', 'booking', booking.id,
      `${parsed.data.label} ${item.amount >= 0 ? '+' : ''}${item.amount}`);
    return {};
  });
}
