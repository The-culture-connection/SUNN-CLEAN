'use client';
import { useState } from 'react';
import type { LineItem } from '@sunnclean/shared';
import { useAction, Err } from './ui';
import { money } from '@/lib/format';

/** Adjustments are ordinary line items, so adding one re-runs
 *  subtotal → tax → total server-side. That is why tax stays correct. */
export function PriceBreakdown(props: {
  bookingId: string; lineItems: LineItem[]; subtotal: number; taxRate: number;
  taxAmount: number; finalTotal: number; estimateTotal: number; taxLabel: string; locked: boolean;
}) {
  const { run, pending, error } = useAction();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const delta = props.finalTotal - props.estimateTotal;

  return (
    <div className="acard">
      <div className="ch">
        <h3>Price breakdown</h3>
        {!props.locked && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Adjustment'}
          </button>
        )}
      </div>
      <div className="cb">
        {props.lineItems.map((l, i) => (
          l.type === 'modifier' && l.amount === 0 ? (
            <div className="pline sub" key={i}>
              <span>{l.label}</span>
              <b>{l.multiplier ? `×${l.multiplier.toFixed(2)}` : l.note ?? ''}</b>
            </div>
          ) : (
            <div className="pline" key={i}>
              <span>
                {l.type === 'adjustment' ? '⊕ ' : ''}{l.label}
                {l.note ? <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}> ({l.note})</span> : null}
              </span>
              <b style={l.type === 'adjustment' ? { color: l.amount >= 0 ? 'var(--good)' : 'var(--bad)' } : undefined}>
                {l.amount >= 0 && l.type === 'adjustment' ? '+' : ''}{money(l.amount)}
              </b>
            </div>
          )
        ))}

        <div className="pline" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
          <span>Subtotal</span><b>{money(props.subtotal)}</b>
        </div>
        <div className="pline">
          <span>{props.taxLabel} ({(props.taxRate * 100).toFixed(3).replace(/\.?0+$/, '')}%)</span>
          <b>{money(props.taxAmount)}</b>
        </div>
        <div className="ptot"><span>Final total</span><b>{money(props.finalTotal)}</b></div>

        {delta !== 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: '.78rem',
            color: 'var(--slate)', background: 'var(--bg)', padding: '9px 11px',
            borderRadius: 8, marginTop: 11,
          }}>
            <span>Original estimate</span>
            <b>{money(props.estimateTotal)} · <span style={{ color: delta > 0 ? 'var(--good)' : 'var(--bad)' }}>
              {delta > 0 ? '+' : ''}{money(delta)}</span></b>
          </div>
        )}

        {adding && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div className="field">
              <label htmlFor="al">What is this for?</label>
              <input id="al" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Extra scope — adhesive residue removal" />
            </div>
            <div className="f2">
              <div className="field">
                <label htmlFor="aa">Amount (negative for a credit)</label>
                <input id="aa" type="number" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="120.00" />
              </div>
              <div className="field">
                <label htmlFor="ar">Internal note</label>
                <input id="ar" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <Err>{error}</Err>
            <button className="btn btn-navy btn-sm" disabled={pending || !label || !amount}
              onClick={async () => {
                const ok = await run(`/api/bookings/${props.bookingId}/adjust`, {
                  label, amount: Number(amount), reason,
                });
                if (ok) { setAdding(false); setLabel(''); setAmount(''); setReason(''); }
              }}>
              {pending ? 'Adding…' : 'Add adjustment'}
            </button>
            <p className="hint">
              Tax is recalculated on the new subtotal — the adjustment is not bolted on after tax.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
