import { z } from 'zod';
import { saveSettings } from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The one document every other part of the system reads. Scheduling constants
 * change what the website offers as bookable; the tax rate changes what new
 * quotes total. Nothing here rewrites a booking that has already been taken —
 * those carry a frozen snapshot of the numbers they were quoted at.
 */

const optionalEmail = z.string().trim().max(200).default('').refine(
  (v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  'That business email does not look right.',
);

const BusinessSchema = z.object({
  legalName: z.string().trim().max(160).default(''),
  displayName: z.string().trim().max(160).default(''),
  tagline: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(40).default(''),
  email: optionalEmail,
  addressLine1: z.string().trim().max(200).default(''),
  addressLine2: z.string().trim().max(200).default(''),
  timezone: z.string().trim().min(1, 'Time zone cannot be blank — every booking time depends on it.').max(80),
  serviceArea: z.string().trim().max(300).default(''),
  serviceAreaNote: z.string().trim().max(600).default(''),
  yearsInBusiness: z.string().trim().max(40).default(''),
  businessesServed: z.string().trim().max(40).default(''),
});

const SchedulingSchema = z.object({
  travelBufferMinutes: z.coerce.number().int().min(0).max(480),
  quotingCrewHeadcount: z.coerce.number().int()
    .min(1, 'Quoting headcount has to be at least one cleaner.').max(30),
  minLeadTimeHours: z.coerce.number().int().min(0).max(720),
  maxHorizonDays: z.coerce.number().int()
    .min(1, 'The booking window needs to be at least one day.').max(365),
  minJobMinutes: z.coerce.number().int().min(15).max(1440),
  maxJobMinutes: z.coerce.number().int().min(15).max(1440),
  slotGranularityMinutes: z.coerce.number().int()
    .min(5, 'Slots any finer than 5 minutes are unusable.').max(240),
  setupMinutes: z.coerce.number().int().min(0).max(240),
  autoConfirmBookings: z.boolean(),
});

const InvoicingSchema = z.object({
  taxRate: z.coerce.number()
    .min(0, 'Tax cannot be negative.')
    .max(0.5, 'That tax rate is over 50%. Check the number — it is stored as a fraction.'),
  taxLabel: z.string().trim().max(60).default('Tax'),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  paymentTermsLabel: z.string().trim().max(60).default(''),
  remitToInstructions: z.string().trim().max(2000).default(''),
  invoiceFooter: z.string().trim().max(2000).default(''),
  invoiceNumberPrefix: z.string().trim().min(1, 'Invoice numbers need a prefix.').max(10)
    .regex(/^[A-Za-z0-9-]+$/, 'The invoice prefix can only use letters, numbers and dashes.'),
});

const ContentSchema = z.object({
  missionStatement: z.string().trim().max(4000).default(''),
  missionHeading: z.string().trim().max(140).default(''),
  heroHeadline: z.string().trim().max(200).default(''),
  heroSubhead: z.string().trim().max(400).default(''),
  aboutBody: z.string().trim().max(8000).default(''),
  values: z.array(z.object({
    title: z.string().trim().max(140).default(''),
    body: z.string().trim().max(1000).default(''),
  })).max(12, 'Twelve values is already more than anybody will read.').default([]),
});

const SettingsSchema = z.object({
  business: BusinessSchema,
  scheduling: SchedulingSchema,
  invoicing: InvoicingSchema,
  content: ContentSchema,
});

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check the settings and try again.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const s = parsed.data;

    if (s.scheduling.maxJobMinutes < s.scheduling.minJobMinutes) {
      return {
        ok: false,
        error: 'The longest job cannot be shorter than the shortest job. Swap those two numbers.',
      };
    }

    // A time zone the server cannot resolve would silently mis-schedule every job.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: s.business.timezone }).format(new Date());
    } catch {
      return {
        ok: false,
        error: `"${s.business.timezone}" is not a time zone the calendar recognises. Try America/New_York.`,
      };
    }

    // Drop empty value rows rather than publishing a blank card on the website.
    const values = s.content.values.filter((v) => v.title || v.body);

    await saveSettings({
      business: s.business,
      scheduling: s.scheduling,
      invoicing: s.invoicing,
      content: { ...s.content, values },
    });

    await logAction(
      user, 'settings.update', 'settings', 'app',
      `tax ${(s.invoicing.taxRate * 100).toFixed(3)}% · buffer ${s.scheduling.travelBufferMinutes}m `
      + `· quoting headcount ${s.scheduling.quotingCrewHeadcount}`,
    );
    return { id: 'app' };
  });
}
