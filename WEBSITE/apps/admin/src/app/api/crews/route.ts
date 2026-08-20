import { z } from 'zod';
import { guard, fail, logAction } from '@/lib/api';
import { deleteCrew, getCrew, upsertCrew, WEEKDAY_LABELS, type Weekday } from '@sunnclean/shared';

export const dynamic = 'force-dynamic';

/**
 * Hours are minutes from local midnight. `end` may run past 1440 for an
 * overnight shift (22:00-02:00 is 1320 -> 1560), so the ceiling is 2880.
 */
const DayHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.coerce.number().int().min(0).max(1439),
  end: z.coerce.number().int().min(0).max(2880),
});

const HoursSchema = z.object({
  sun: DayHoursSchema,
  mon: DayHoursSchema,
  tue: DayHoursSchema,
  wed: DayHoursSchema,
  thu: DayHoursSchema,
  fri: DayHoursSchema,
  sat: DayHoursSchema,
});

const CrewSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Every crew needs a name.').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour for this crew.'),
  active: z.boolean(),
  headcount: z.coerce.number().int().min(1, 'A crew needs at least one cleaner.').max(30),
  priority: z.coerce.number().int().min(1).max(99),
  hourlyCostPerCleaner: z.coerce.number().min(0).max(1000),
  notes: z.string().max(2000).default(''),
  hours: HoursSchema,
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Blackout dates must look like 2026-09-14.')).max(400),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

/** Turns the first zod problem into a sentence a person can act on. */
function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue?.message ?? 'Please check the crew details and try again.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = CrewSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const crew = parsed.data;

    // A shift that ends before it starts would quietly produce zero bookable time.
    for (const [day, hours] of Object.entries(crew.hours) as [Weekday, z.infer<typeof DayHoursSchema>][]) {
      if (hours.enabled && hours.end <= hours.start) {
        return {
          ok: false,
          error: `${WEEKDAY_LABELS[day]} ends before it starts. If the shift runs past midnight, tick "ends next day".`,
        };
      }
    }

    // Duplicate blackout dates are harmless but make the list confusing.
    const blackoutDates = [...new Set(crew.blackoutDates)].sort();

    const id = await upsertCrew({ ...crew, blackoutDates });
    await logAction(
      user, crew.id ? 'crew.update' : 'crew.create', 'crew', id,
      `${crew.name} · ${crew.headcount} cleaner(s) · ${crew.active ? 'active' : 'inactive'}`,
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

    const existing = await getCrew(parsed.data.id);
    if (!existing) return { ok: false, error: 'That crew has already been removed.' };

    const result = await deleteCrew(parsed.data.id);
    if (!result.ok) {
      const count = result.count ?? 0;
      return {
        ok: false,
        error: result.reason === 'has_upcoming_jobs'
          ? `${existing.name} still has ${count} upcoming job${count === 1 ? '' : 's'}. Reassign them first.`
          : 'That crew could not be deleted.',
      };
    }

    await logAction(user, 'crew.delete', 'crew', parsed.data.id, existing.name);
    return { id: parsed.data.id };
  });
}
