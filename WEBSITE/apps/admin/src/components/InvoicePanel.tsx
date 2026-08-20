'use client';
import { useState } from 'react';
import { useAction, Err } from './ui';
import { money } from '@/lib/format';

/**
 * SUNN CLEAN does not process payments. This panel generates the invoice and
 * writes the email; Grace sends it from her own inbox and marks it sent. That
 * keeps the sent message in her real thread with the customer and means no
 * email service to configure or pay for.
 */
export function InvoicePanel(props: {
  bookingId: string; canGenerate: boolean;
  invoice: { id: string; invoiceNumber: string; status: string; amount: number; dueLabel: string } | null;
  customerEmail: string; customerName: string; serviceName: string;
  serviceDateLabel: string; addressLabel: string; total: number;
  termsLabel: string; remitTo: string; businessName: string;
}) {
  const { run, pending, error } = useAction();
  const [showEmail, setShowEmail] = useState(false);
  const [copied, setCopied] = useState('');
  const [method, setMethod] = useState('check');

  const inv = props.invoice;
  const subject = inv
    ? `${props.businessName} — Invoice ${inv.invoiceNumber} for service on ${props.serviceDateLabel}`
    : '';
  const body = inv ? [
    `Hi ${props.customerName.split(' ')[0] || 'there'},`, '',
    `Thank you for choosing ${props.businessName}. Please find attached invoice ${inv.invoiceNumber} for the ${props.serviceName} completed at ${props.addressLabel} on ${props.serviceDateLabel}.`,
    '',
    `Invoice total: ${money(inv.amount)}`,
    `Payment terms: ${props.termsLabel}`,
    inv.dueLabel ? `Due date: ${inv.dueLabel}` : '',
    '',
    props.remitTo ? `How to pay:\n${props.remitTo}` : '',
    '',
    'If you have any questions about this invoice, just reply to this email or give us a call.',
    '', 'Thank you,', props.businessName,
  ].filter((l) => l !== undefined).join('\n') : '';

  const mailto = `mailto:${encodeURIComponent(props.customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2000); }
    catch { /* clipboard blocked — the textarea is selectable as a fallback */ }
  }

  return (
    <div className="acard" style={{ borderColor: 'var(--yellow)', borderWidth: 1.5 }}>
      <div className="ch" style={{ background: '#fffdf6' }}>
        <h3>Invoice</h3>
        <span className={`chip ${inv?.status === 'paid' ? 'c-good' : inv ? 'c-info' : 'c-warn'}`}>
          {inv ? inv.status : 'Not created'}
        </span>
      </div>
      <div className="cb">
        <p style={{ fontSize: '.84rem', color: 'var(--slate)', marginBottom: 14 }}>
          We don&apos;t process payments. This generates the PDF and writes the email —
          you send it from your own inbox.
        </p>

        <Err>{error}</Err>

        {!inv ? (
          <>
            <button className="btn btn-navy" style={{ width: '100%' }}
              disabled={!props.canGenerate || pending}
              onClick={() => run(`/api/bookings/${props.bookingId}/invoice`, { action: 'generate' })}>
              {pending ? 'Generating…' : '① Generate Invoice'}
            </button>
            {!props.canGenerate && (
              <p className="hint">Mark the job complete first.</p>
            )}
          </>
        ) : (
          <>
            <div className="drow"><span>Invoice number</span><b>{inv.invoiceNumber}</b></div>
            <div className="drow"><span>Amount</span><b>{money(inv.amount)}</b></div>
            {inv.dueLabel && <div className="drow"><span>Due</span><b>{inv.dueLabel}</b></div>}

            <div style={{ display: 'flex', gap: 8, margin: '14px 0 9px' }}>
              <a className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer">
                Download PDF
              </a>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                onClick={() => setShowEmail(!showEmail)}>
                {showEmail ? 'Hide email' : '② Prepare Email'}
              </button>
            </div>

            {showEmail && (
              <div style={{ marginTop: 8 }}>
                <div className="field">
                  <label htmlFor="isub">Subject</label>
                  <input id="isub" readOnly value={subject} onFocus={(e) => e.currentTarget.select()} />
                </div>
                <span className="flabel">Body</span>
                <div className="emailprev">{body}</div>
                <div style={{ display: 'flex', gap: 8, margin: '11px 0' }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                    onClick={() => copy(`${subject}\n\n${body}`, 'text')}>
                    {copied === 'text' ? '✓ Copied' : 'Copy text'}
                  </button>
                  <a className="btn btn-ghost btn-sm" style={{ flex: 1 }} href={mailto}>
                    Open in email
                  </a>
                </div>
                <div className="note" style={{ fontSize: '.79rem', margin: '0 0 11px' }}>
                  Don&apos;t forget to <b>attach the PDF</b> before sending.
                </div>
                {inv.status === 'draft' && (
                  <button className="btn btn-navy" style={{ width: '100%' }} disabled={pending}
                    onClick={() => run(`/api/bookings/${props.bookingId}/invoice`, { action: 'mark_sent' })}>
                    ③ Mark as Sent
                  </button>
                )}
              </div>
            )}

            {inv.status === 'sent' && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div className="field">
                  <label htmlFor="pm">Payment method</label>
                  <select id="pm" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="check">Check</option>
                    <option value="ach">Bank transfer / ACH</option>
                    <option value="cash">Cash</option>
                    <option value="card_offline">Card (taken offline)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={pending}
                  onClick={() => run(`/api/bookings/${props.bookingId}/invoice`, {
                    action: 'mark_paid', method,
                  })}>
                  ④ Mark as Paid
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
