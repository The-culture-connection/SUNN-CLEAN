import 'server-only';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import {
  computeQuote, estimateDuration, getSettings, listAddOns, listBlackouts,
  listCrews, listPropertyTypes, listServices, listSurcharges,
  type CatalogItem, type QuoteResult,
} from '@sunnclean/shared';

/* --------------------------- validation --------------------------- */

export const AddOnSelectionSchema = z.object({
  id: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(999),
});

export const QuoteSchema = z.object({
  serviceId: z.string().min(1),
  propertyTypeId: z.string().default(''),
  squareFeet: z.coerce.number().min(1).max(5_000_000),
  floors: z.coerce.number().int().min(1).max(200).default(1),
  hasElevator: z.coerce.boolean().default(true),
  addOns: z.array(AddOnSelectionSchema).max(40).default([]),
  startAt: z.coerce.number().optional(),
});

export const BookingSchema = QuoteSchema.extend({
  startAt: z.coerce.number().int().positive(),
  customer: z.object({
    businessName: z.string().max(160).default(''),
    contactName: z.string().min(1).max(120),
    email: z.string().email().max(200),
    phone: z.string().min(7).max(40),
    preferredContact: z.enum(['email', 'phone']).default('email'),
  }),
  site: z.object({
    address1: z.string().min(1).max(200),
    address2: z.string().max(120).default(''),
    city: z.string().min(1).max(120),
    state: z.string().min(1).max(60),
    zip: z.string().min(3).max(20),
    accessNotes: z.string().max(2000).default(''),
    parkingNotes: z.string().max(1000).default(''),
  }),
  customerNotes: z.string().max(2000).default(''),
  recurringFrequency: z.string().max(60).default('one_time'),
  agreed: z.literal(true),
  /** Honeypot — real users never fill this. */
  website: z.string().max(0).optional().or(z.literal('')),
});

/* ------------------------- shared loading ------------------------- */

export async function loadEngineContext() {
  const [settings, services, addOns, propertyTypes, surcharges, crews, blackouts] =
    await Promise.all([
      getSettings(), listServices(true), listAddOns(true), listPropertyTypes(true),
      listSurcharges(true), listCrews(true), listBlackouts(),
    ]);
  return { settings, services, addOns, propertyTypes, surcharges, crews, blackouts };
}

export type EngineContext = Awaited<ReturnType<typeof loadEngineContext>>;

export function resolveSelection(ctx: EngineContext, input: z.infer<typeof QuoteSchema>) {
  const service = ctx.services.find((s) => s.id === input.serviceId) ?? null;
  const propertyType = ctx.propertyTypes.find((p) => p.id === input.propertyTypeId)
    ?? ctx.propertyTypes[0] ?? null;
  const selectedAddOns = input.addOns
    .map((a) => {
      const item = ctx.addOns.find((x) => x.id === a.id);
      return item ? { item, quantity: a.quantity } : null;
    })
    .filter((x): x is { item: CatalogItem; quantity: number } => x !== null && x.quantity > 0);
  return { service, propertyType, selectedAddOns };
}

export function quoteFor(ctx: EngineContext, input: z.infer<typeof QuoteSchema>): QuoteResult | null {
  const { service, propertyType, selectedAddOns } = resolveSelection(ctx, input);
  if (!service) return null;
  return computeQuote({
    service, propertyType,
    squareFeet: input.squareFeet,
    floors: input.floors,
    hasElevator: input.hasElevator,
    addOns: selectedAddOns,
    surcharges: ctx.surcharges,
    scheduling: ctx.settings.scheduling,
    invoicing: ctx.settings.invoicing,
    timezone: ctx.settings.business.timezone,
    startAt: input.startAt,
  });
}

export function durationFor(ctx: EngineContext, input: z.infer<typeof QuoteSchema>) {
  const { service, selectedAddOns } = resolveSelection(ctx, input);
  if (!service) return null;
  return estimateDuration({
    service, squareFeet: input.squareFeet,
    addOns: selectedAddOns, settings: ctx.settings.scheduling,
  });
}

/* ---------------------------- helpers ----------------------------- */

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function bad(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * In-memory rate limiter. Adequate for a single Railway instance, which is what
 * this runs on. If the customer site is ever scaled to multiple replicas this
 * must move to Firestore or Redis, because each instance would keep its own
 * counter and the effective limit would multiply by the replica count.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

// Keep the map from growing without bound on a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 300_000).unref?.();
