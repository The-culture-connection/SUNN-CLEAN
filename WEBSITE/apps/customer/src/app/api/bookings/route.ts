import { NextResponse } from 'next/server';
import { createBooking, type PricingBlock } from '@sunnclean/shared';
import {
  BookingSchema, loadEngineContext, quoteFor, durationFor, resolveSelection,
  bad, clientIp, rateLimit,
} from '@/lib/api';

export const dynamic = 'force-dynamic';

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: 'One-time cleaning',
  monthly: 'Monthly',
  biweekly: 'Every two weeks',
  weekly: 'Weekly',
  multi: '2–5× per week',
};

export async function POST(req: Request) {
  const ip = clientIp(req);
  // No payment step means no natural friction, so the form needs its own.
  if (!rateLimit(`book:${ip}`, 3, 60 * 60_000)) {
    return bad('Too many booking attempts. Please call us instead.', 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = BookingSchema.safeParse(body);
  if (!parsed.success) return bad('Please check the form and try again', 400, {
    issues: parsed.error.flatten(),
  });
  const input = parsed.data;

  // Honeypot: a real browser leaves this empty.
  if (input.website) return NextResponse.json({ ok: true, bookingId: 'ignored' });

  const ctx = await loadEngineContext();
  const tz = ctx.settings.business.timezone;
  const { service } = resolveSelection(ctx, input);
  if (!service) return bad('That service is no longer available', 404);

  // Recompute price and duration from settings. The client's numbers are for
  // display only and are never read here.
  const quote = quoteFor(ctx, input);
  const duration = durationFor(ctx, input);
  if (!quote || !duration) return bad('Could not price that request', 400);
  if (!duration.ok) return bad('That job needs a custom quote — please call us', 422, {
    reason: 'requires_manual_quote',
  });

  const pricing: PricingBlock = {
    lineItems: quote.lineItems,
    subtotal: quote.subtotal,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    finalTotal: quote.total,
    estimateTotal: quote.total,
    currency: 'USD',
    rateSnapshot: quote.rateSnapshot,
  };

  const recurring = input.recurringFrequency !== 'one_time';
  const selectedAddOns = resolveSelection(ctx, input).selectedAddOns.map((a) => ({
    id: a.item.id,
    name: a.item.name,
    quantity: a.quantity,
    unitPrice: a.item.price ?? 0,
    total: (a.item.price ?? 0) * a.quantity,
  }));

  const result = await createBooking({
    start: input.startAt,
    durationMinutes: duration.minutes,
    crews: ctx.crews,
    settings: ctx.settings.scheduling,
    timezone: tz,
    pricing,
    customer: {
      businessName: input.customer.businessName.trim(),
      contactName: input.customer.contactName.trim(),
      email: input.customer.email.toLowerCase().trim(),
      phone: input.customer.phone.trim(),
      preferredContact: input.customer.preferredContact,
    },
    site: input.site,
    property: {
      propertyTypeId: input.propertyTypeId,
      propertyTypeName: resolveSelection(ctx, input).propertyType?.name ?? '',
      squareFeet: input.squareFeet,
      floors: input.floors,
      hasElevator: input.hasElevator,
    },
    service: {
      serviceId: service.id,
      serviceName: service.name,
      customerNotes: input.customerNotes,
      recurringInterest: recurring,
      recurringFrequencyLabel: FREQUENCY_LABELS[input.recurringFrequency] ?? '',
    },
    addOns: selectedAddOns,
    source: 'web',
  });

  if (!result.ok) {
    // Someone else took the slot between the availability call and this submit.
    return NextResponse.json(
      { ok: false, error: 'That time was just taken. Please pick another.', reason: result.reason },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    bookingId: result.bookingId,
    bookingNumber: result.bookingNumber,
    lookupToken: result.lookupToken,
    autoConfirmed: ctx.settings.scheduling.autoConfirmBookings,
  });
}
