import { z } from 'zod';
import { guard, fail, logAction } from '@/lib/api';
import { deleteCatalogItem, getCatalogItem, upsertCatalogItem } from '@sunnclean/shared';

export const dynamic = 'force-dynamic';

const common = {
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Give this a name customers will recognise.').max(80),
  description: z.string().max(600).default(''),
  active: z.boolean(),
  order: z.coerce.number().int().min(0).max(999),
};

const ServiceSchema = z.object({
  ...common,
  kind: z.literal('service'),
  ratePerSqFt: z.coerce.number().min(0, 'Rate cannot be negative.').max(100),
  minimumCharge: z.coerce.number().min(0, 'Minimum charge cannot be negative.').max(100000),
  productionRateSqFtPerCleanerHour: z.coerce.number()
    .min(1, 'One cleaner has to cover at least 1 sq ft an hour — this number sets how long jobs take.')
    .max(100000),
});

const AddOnSchema = z.object({
  ...common,
  kind: z.literal('addon'),
  price: z.coerce.number().min(0, 'Price cannot be negative.').max(100000),
  unitLabel: z.string().trim().max(60).default(''),
  minutesPerUnit: z.coerce.number().int().min(0, 'Minutes cannot be negative.').max(1440),
  allowQuantity: z.boolean(),
});

const ItemSchema = z.discriminatedUnion('kind', [ServiceSchema, AddOnSchema]);
const DeleteSchema = z.object({ id: z.string().min(1) });

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue?.message ?? 'Please check these details and try again.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = ItemSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const item = parsed.data;

    const id = await upsertCatalogItem(item);
    const label = item.kind === 'service' ? 'service' : 'add-on';
    await logAction(
      user, item.id ? 'catalog.update' : 'catalog.create', 'catalog', id,
      `${label}: ${item.name}`,
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

    const existing = await getCatalogItem(parsed.data.id);
    if (!existing) return { ok: false, error: 'That item has already been removed.' };

    await deleteCatalogItem(parsed.data.id);
    await logAction(user, 'catalog.delete', 'catalog', parsed.data.id, `${existing.kind}: ${existing.name}`);
    return { id: parsed.data.id };
  });
}
