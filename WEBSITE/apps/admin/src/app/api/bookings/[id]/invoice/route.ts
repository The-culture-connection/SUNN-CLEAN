import { z } from 'zod';
import {
  deleteNotificationsFor, getBooking, getInvoice, getSettings, nextSequence,
  saveInvoice, updateBooking,
} from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  action: z.enum(['generate', 'mark_sent', 'mark_paid', 'void']),
  method: z.enum(['check', 'ach', 'cash', 'card_offline', 'other']).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Invalid request');

  return guard(async (user) => {
    const booking = await getBooking(params.id);
    if (!booking) return { ok: false, error: 'Booking not found' };
    const settings = await getSettings();

    /* ---------------- generate ---------------- */
    if (parsed.data.action === 'generate') {
      if (booking.status !== 'completed') {
        return { ok: false, error: 'Mark the job complete before invoicing it.' };
      }
      if (booking.invoiceId) return { ok: false, error: 'This booking already has an invoice.' };

      const invoiceNumber = await nextSequence('invoices', settings.invoicing.invoiceNumberPrefix || 'INV');
      const invoiceId = await saveInvoice({
        invoiceNumber,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        customerName: booking.customer.businessName || booking.customer.contactName,
        customerEmail: booking.customer.email,
        status: 'draft',
        lineItems: booking.pricing.lineItems,
        subtotal: booking.pricing.subtotal,
        taxRate: booking.pricing.taxRate,
        taxAmount: booking.pricing.taxAmount,
        amount: booking.pricing.finalTotal,
        issuedAt: Date.now(),
        termsLabel: settings.invoicing.paymentTermsLabel,
      });

      await updateBooking(booking.id, { invoiceId });
      await deleteNotificationsFor(booking.id, 'invoice_needed');
      await logAction(user, 'Generated invoice', 'booking', booking.id, invoiceNumber);
      return { invoiceId, invoiceNumber };
    }

    if (!booking.invoiceId) return { ok: false, error: 'Generate the invoice first.' };
    const invoice = await getInvoice(booking.invoiceId);
    if (!invoice) return { ok: false, error: 'Invoice not found' };

    /* ---------------- mark sent ---------------- */
    if (parsed.data.action === 'mark_sent') {
      const due = Date.now() + (settings.invoicing.paymentTermsDays ?? 15) * 86_400_000;
      await saveInvoice({
        id: invoice.id, status: 'sent', sentAt: Date.now(),
        sentByUid: user.uid, dueDate: due,
      });
      await logAction(user, 'Marked invoice sent', 'booking', booking.id, invoice.invoiceNumber);
      return {};
    }

    /* ---------------- mark paid ---------------- */
    if (parsed.data.action === 'mark_paid') {
      await saveInvoice({
        id: invoice.id, status: 'paid', paidAt: Date.now(),
        paidAmount: invoice.amount, paymentMethod: parsed.data.method ?? 'other',
      });
      await deleteNotificationsFor(booking.id, 'invoice_overdue');
      await logAction(user, 'Marked invoice paid', 'booking', booking.id,
        `${invoice.invoiceNumber} · ${parsed.data.method ?? 'other'}`);
      return {};
    }

    /* ---------------- void ---------------- */
    await saveInvoice({ id: invoice.id, status: 'void' });
    await logAction(user, 'Voided invoice', 'booking', booking.id, invoice.invoiceNumber);
    return {};
  });
}
