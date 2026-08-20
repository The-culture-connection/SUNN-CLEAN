import { DateTime } from 'luxon';
import { getBooking, getInvoice, getSettings } from '@sunnclean/shared';
import { requireApiUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Invoices render as a self-contained, print-ready HTML document rather than a
 * binary PDF. The browser's own "Save as PDF" produces the file, which avoids
 * shipping a headless-Chrome or PDF-toolkit dependency on Railway for a
 * document that is generated a handful of times a week. `window.print()` fires
 * on load so the save dialog opens immediately.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireApiUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const invoice = await getInvoice(params.id);
  if (!invoice) return new Response('Invoice not found', { status: 404 });
  const [booking, settings] = await Promise.all([
    getBooking(invoice.bookingId), getSettings(),
  ]);

  const tz = settings.business.timezone;
  const b = settings.business;
  const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const esc = (s: string) => (s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  const serviceDate = booking
    ? DateTime.fromMillis(booking.schedule.serviceStart, { zone: tz }).toFormat('LLLL d, yyyy')
    : '';
  const issued = DateTime.fromMillis(invoice.issuedAt, { zone: tz }).toFormat('LLLL d, yyyy');
  const due = invoice.dueDate
    ? DateTime.fromMillis(invoice.dueDate, { zone: tz }).toFormat('LLLL d, yyyy') : '—';

  const rows = invoice.lineItems
    .filter((l) => !(l.type === 'modifier' && l.amount === 0))
    .map((l) => `<tr><td>${esc(l.label)}${l.note ? `<br><small>${esc(l.note)}</small>` : ''}</td>
      <td class="r">${money(l.amount)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${esc(invoice.invoiceNumber)}</title>
<style>
  @page { margin: 18mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:14px/1.6 ui-sans-serif,system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#12212B;padding:24px;max-width:820px;margin:0 auto}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid #003C60;padding-bottom:18px;margin-bottom:22px}
  h1{font-size:1.9rem;color:#003C60;letter-spacing:-.02em}
  .sub{font-size:.72rem;letter-spacing:.18em;color:#0E5A85;font-weight:700}
  .meta{text-align:right;font-size:.86rem;color:#5B6B77}
  .meta b{color:#003C60;display:block;font-size:1.05rem}
  .cols{display:flex;gap:40px;margin-bottom:24px}
  .cols h3{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#0077A8;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:18px}
  th{text-align:left;font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;color:#5B6B77;padding:9px 10px;border-bottom:2px solid #DCE5EC}
  td{padding:9px 10px;border-bottom:1px solid #EEF3F7}
  small{color:#8395A2}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .totals{margin-left:auto;width:290px}
  .totals div{display:flex;justify-content:space-between;padding:6px 10px;font-size:.9rem;color:#5B6B77}
  .totals .grand{border-top:2px solid #003C60;margin-top:6px;padding-top:11px;font-size:1.2rem;font-weight:800;color:#003C60}
  .pay{background:#E9F5FC;border-left:4px solid #0C9CD8;padding:16px 18px;border-radius:0 8px 8px 0;margin:24px 0;font-size:.9rem;white-space:pre-wrap}
  .pay b{color:#003C60;display:block;margin-bottom:5px}
  footer{margin-top:30px;padding-top:16px;border-top:1px solid #DCE5EC;font-size:.8rem;color:#8395A2;white-space:pre-wrap}
  @media print{ body{padding:0} .noprint{display:none} }
</style></head><body onload="window.print()">
  <div class="top">
    <div>
      <h1>${esc(b.displayName || 'SUNN CLEAN')}</h1>
      <div class="sub">${esc((b.tagline || '').toUpperCase())}</div>
      <div style="margin-top:10px;font-size:.85rem;color:#5B6B77">
        ${esc(b.addressLine1)}${b.addressLine2 ? `<br>${esc(b.addressLine2)}` : ''}
        ${b.phone ? `<br>${esc(b.phone)}` : ''}${b.email ? `<br>${esc(b.email)}` : ''}
      </div>
    </div>
    <div class="meta">
      <b>INVOICE</b>
      ${esc(invoice.invoiceNumber)}<br>
      Issued ${issued}<br>
      Due ${due}<br>
      Terms ${esc(invoice.termsLabel || '')}
    </div>
  </div>

  <div class="cols">
    <div style="flex:1">
      <h3>Bill to</h3>
      <b>${esc(invoice.customerName)}</b><br>
      <span style="color:#5B6B77">${esc(invoice.customerEmail)}</span>
    </div>
    ${booking ? `<div style="flex:1">
      <h3>Service address</h3>
      ${esc(booking.site.address1)}${booking.site.address2 ? `<br>${esc(booking.site.address2)}` : ''}<br>
      ${esc(booking.site.city)}, ${esc(booking.site.state)} ${esc(booking.site.zip)}
    </div>
    <div style="flex:1">
      <h3>Service</h3>
      ${esc(booking.service.serviceName)}<br>
      <span style="color:#5B6B77">${serviceDate}<br>${booking.property.squareFeet.toLocaleString()} sq ft</span>
    </div>` : ''}
  </div>

  <table>
    <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div>
    <div><span>${esc(settings.invoicing.taxLabel || 'Tax')}</span><span>${money(invoice.taxAmount)}</span></div>
    <div class="grand"><span>Total due</span><span>${money(invoice.amount)}</span></div>
  </div>

  ${settings.invoicing.remitToInstructions
    ? `<div class="pay"><b>How to pay</b>${esc(settings.invoicing.remitToInstructions)}</div>` : ''}

  ${settings.invoicing.invoiceFooter ? `<footer>${esc(settings.invoicing.invoiceFooter)}</footer>` : ''}
  <footer>Thank you for your business.</footer>
</body></html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
