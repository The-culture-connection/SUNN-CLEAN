import { z } from 'zod';
import { guard, fail, logAction } from '@/lib/api';
import {
  deletePropertyType, deleteSurcharge, listPropertyTypes, listSurcharges,
  upsertPropertyType, upsertSurcharge,
} from '@sunnclean/shared';

export const dynamic = 'force-dynamic';

/**
 * Percent surcharges are stored as a fraction (0.15 = +15%). The editor shows
 * "15" and divides before it posts, so this schema only ever sees the fraction.
 */
const SurchargeSchema = z.object({
  target: z.literal('surcharge'),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Give the surcharge a name.').max(80),
  description: z.string().max(400).default(''),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().min(0, 'A surcharge cannot be negative.').max(100000),
  trigger: z.enum(['after_hours', 'weekend', 'holiday', 'no_elevator', 'manual']),
  beforeMinute: z.coerce.number().int().min(0).max(1439).optional(),
  afterMinute: z.coerce.number().int().min(0).max(1439).optional(),
  minFloors: z.coerce.number().int().min(1).max(200).optional(),
  active: z.boolean(),
  order: z.coerce.number().int().min(0).max(999),
});

const PropertyTypeSchema = z.object({
  target: z.literal('propertyType'),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Give the property type a name.').max(80),
  modifier: z.coerce.number()
    .min(0.1, 'A multiplier under 0.1 would give the work away.')
    .max(10, 'A multiplier over 10 is almost certainly a typo.'),
  active: z.boolean(),
  order: z.coerce.number().int().min(0).max(999),
});

const BodySchema = z.discriminatedUnion('target', [SurchargeSchema, PropertyTypeSchema])
  .superRefine((body, ctx) => {
    // 1500 instead of 15 would quietly bill someone 150,000%.
    if (body.target === 'surcharge' && body.type === 'percent' && body.value > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'That percentage looks too high — enter 15 for 15%, not 1500.',
        path: ['value'],
      });
    }
  });

const DeleteSchema = z.object({
  target: z.enum(['surcharge', 'propertyType']),
  id: z.string().min(1),
});

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue?.message ?? 'Please check these details and try again.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    if (parsed.data.target === 'surcharge') {
      const { target: _t, ...s } = parsed.data;
      // Only keep the conditions the chosen trigger actually reads.
      const id = await upsertSurcharge({
        ...s,
        beforeMinute: s.trigger === 'after_hours' ? s.beforeMinute ?? 7 * 60 : undefined,
        afterMinute: s.trigger === 'after_hours' ? s.afterMinute ?? 18 * 60 : undefined,
        minFloors: s.trigger === 'no_elevator' ? s.minFloors ?? 2 : undefined,
      });
      await logAction(
        user, s.id ? 'surcharge.update' : 'surcharge.create', 'surcharge', id,
        `${s.name} · ${s.type === 'percent' ? `${s.value * 100}%` : `$${s.value}`} · ${s.active ? 'on' : 'off'}`,
      );
      return { id };
    }

    const { target: _t2, ...p } = parsed.data;
    const id = await upsertPropertyType(p);
    await logAction(
      user, p.id ? 'propertyType.update' : 'propertyType.create', 'propertyType', id,
      `${p.name} · x${p.modifier}`,
    );
    return { id };
  });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'Invalid request' };
    const { target, id } = parsed.data;

    if (target === 'surcharge') {
      const existing = (await listSurcharges(false)).find((s) => s.id === id);
      if (!existing) return { ok: false, error: 'That surcharge has already been removed.' };
      await deleteSurcharge(id);
      await logAction(user, 'surcharge.delete', 'surcharge', id, existing.name);
      return { id };
    }

    const existing = (await listPropertyTypes(false)).find((p) => p.id === id);
    if (!existing) return { ok: false, error: 'That property type has already been removed.' };
    await deletePropertyType(id);
    await logAction(user, 'propertyType.delete', 'propertyType', id, existing.name);
    return { id };
  });
}
