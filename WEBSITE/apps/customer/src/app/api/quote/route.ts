import { NextResponse } from 'next/server';
import { QuoteSchema, loadEngineContext, quoteFor, durationFor, bad, clientIp, rateLimit } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Price + duration. Always recomputed server-side; a client price is never trusted. */
export async function POST(req: Request) {
  if (!rateLimit(`quote:${clientIp(req)}`, 120, 60_000)) return bad('Too many requests', 429);
  const parsed = QuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Invalid request', 400, { issues: parsed.error.flatten() });

  const ctx = await loadEngineContext();
  const quote = quoteFor(ctx, parsed.data);
  const duration = durationFor(ctx, parsed.data);
  if (!quote || !duration) return bad('That service is not available', 404);

  return NextResponse.json({
    ok: quote.ok,
    reason: quote.reason,
    durationMinutes: duration.minutes,
    lineItems: quote.lineItems,
    subtotal: quote.subtotal,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    total: quote.total,
    taxLabel: ctx.settings.invoicing.taxLabel,
  });
}
