'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import type { CatalogItem, LineItem, PropertyType, Settings } from '@sunnclean/shared';
import { money, durationLabel } from './Money';

type Slot = { start: number; end: number; startLabel: string; endLabel: string };

interface Props {
  settings: Settings;
  services: CatalogItem[];
  addOns: CatalogItem[];
  propertyTypes: PropertyType[];
}

const FREQUENCIES = [
  ['one_time', 'One-time cleaning'],
  ['monthly', 'Monthly (recurring)'],
  ['biweekly', 'Every two weeks (recurring)'],
  ['weekly', 'Weekly (recurring)'],
  ['multi', '2–5× per week (recurring)'],
] as const;

export function BookingWizard({ settings, services, addOns, propertyTypes }: Props) {
  const tz = settings.business.timezone;

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [propertyTypeId, setPropertyTypeId] = useState(propertyTypes[0]?.id ?? '');
  const [squareFeet, setSquareFeet] = useState(5000);
  const [floors, setFloors] = useState(1);
  const [hasElevator, setHasElevator] = useState(true);
  const [frequency, setFrequency] = useState<string>('one_time');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  const [month, setMonth] = useState(() => DateTime.now().setZone(tz).startOf('month'));
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [selDate, setSelDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotReason, setSlotReason] = useState<string | undefined>();
  const [selSlot, setSelSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [form, setForm] = useState({
    businessName: '', contactName: '', email: '', phone: '',
    address1: '', address2: '', city: '', state: '', zip: '',
    accessNotes: '', parkingNotes: '', preferredContact: 'email' as 'email' | 'phone',
  });
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot

  const [quote, setQuote] = useState<{
    ok: boolean; reason?: string; durationMinutes: number; lineItems: LineItem[];
    subtotal: number; taxRate: number; taxAmount: number; total: number; taxLabel: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{
    bookingNumber: string; lookupToken: string; autoConfirmed: boolean;
  } | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const selectedAddOns = useMemo(
    () => addOns.filter((a) => (qty[a.id] ?? 0) > 0).map((a) => ({ id: a.id, quantity: qty[a.id] })),
    [addOns, qty],
  );

  const payload = useMemo(() => ({
    serviceId, propertyTypeId, squareFeet, floors, hasElevator,
    addOns: selectedAddOns, startAt: selSlot?.start,
  }), [serviceId, propertyTypeId, squareFeet, floors, hasElevator, selectedAddOns, selSlot]);

  /* ---------------- live quote ---------------- */
  const quoteTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!serviceId || !(squareFeet > 0)) { setQuote(null); return; }
    clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) setQuote(await res.json());
      } catch { /* leave the previous quote on screen */ }
    }, 250);
    return () => clearTimeout(quoteTimer.current);
  }, [payload, serviceId, squareFeet]);

  /* ---------------- month availability ---------------- */
  const loadMonth = useCallback(async () => {
    if (!serviceId) return;
    try {
      const res = await fetch('/api/availability/month', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, month: month.toFormat('yyyy-MM') }),
      });
      const data = await res.json();
      setMonthCounts(data.days ?? {});
    } catch { setMonthCounts({}); }
  }, [payload, month, serviceId]);

  useEffect(() => { if (step === 3) void loadMonth(); }, [step, loadMonth]);

  /* ---------------- day slots ---------------- */
  async function pickDay(date: string) {
    setSelDate(date); setSelSlot(null); setLoadingSlots(true); setSlotReason(undefined);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, date }),
      });
      const data = await res.json();
      setSlots(data.slots ?? []);
      setSlotReason(data.reason);
    } catch { setSlots([]); } finally { setLoadingSlots(false); }
  }

  /* ---------------- submit ---------------- */
  async function submit() {
    if (!selSlot || !agreed) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          startAt: selSlot.start,
          customer: {
            businessName: form.businessName, contactName: form.contactName,
            email: form.email, phone: form.phone, preferredContact: form.preferredContact,
          },
          site: {
            address1: form.address1, address2: form.address2, city: form.city,
            state: form.state, zip: form.zip,
            accessNotes: form.accessNotes, parkingNotes: form.parkingNotes,
          },
          customerNotes: notes,
          recurringFrequency: frequency,
          agreed: true,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        if (res.status === 409) { setStep(3); setSelSlot(null); void pickDay(selDate!); }
        return;
      }
      setDone(data);
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
    } finally { setSubmitting(false); }
  }

  /* ---------------- no catalog yet ---------------- */
  if (services.length === 0) {
    return (
      <div className="empty">
        <h3>Online booking is almost ready</h3>
        <p>
          We&apos;re finishing our service list. In the meantime give us a call or send a
          message and we&apos;ll quote your space the same day.
        </p>
        <a className="btn btn-primary" style={{ marginTop: 18 }} href="/contact">Contact us</a>
      </div>
    );
  }

  /* ---------------- confirmation ---------------- */
  if (done) {
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/booking/${done.lookupToken}` : '';
    return (
      <div className="confirm">
        <div className="tick" aria-hidden>✓</div>
        <h2>{done.autoConfirmed ? "You're booked!" : 'Request received!'}</h2>
        <p className="lede" style={{ margin: '12px auto 0' }}>
          {done.autoConfirmed
            ? "We've reserved your crew. Save the link below — it's how you check or change this booking."
            : "We've held your time slot and will confirm shortly. Save the link below to check the status."}
        </p>
        <div className="confbox">
          <div className="confrow"><span>Booking number</span><b>{done.bookingNumber}</b></div>
          <div className="confrow"><span>Service</span><b>{service?.name} — {squareFeet.toLocaleString()} sq ft</b></div>
          <div className="confrow"><span>Date &amp; time</span><b>
            {selDate && DateTime.fromISO(selDate, { zone: tz }).toFormat('cccc, LLLL d, yyyy')}
            <br />{selSlot?.startLabel}–{selSlot?.endLabel}
          </b></div>
          <div className="confrow"><span>Estimated length</span><b>{durationLabel(quote?.durationMinutes ?? 0)}</b></div>
          <div className="confrow"><span>Address</span><b>{form.address1}<br />{form.city}, {form.state} {form.zip}</b></div>
          <div className="confrow"><span>Estimated total</span><b>{money(quote?.total ?? 0)}</b></div>
        </div>
        <div className="tokenbox">
          <b>⚠ Save this link</b>
          <code>{url}</code>
          <p>
            There&apos;s no account to log into — this private link is how you view, reschedule
            or cancel your booking. Bookmark it or send it to yourself now.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 11, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <a className="btn btn-ghost" href={url}>Open my booking</a>
          <a className="btn btn-navy" href="/">Back to home</a>
        </div>
      </div>
    );
  }

  /* ---------------- calendar grid ---------------- */
  const firstDay = month.startOf('month');
  const daysInMonth = month.daysInMonth ?? 30;
  const leading = firstDay.weekday % 7; // luxon Mon=1 … Sun=7 → Sun-first
  const todayIso = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');

  const canContinue3 = !!selSlot;
  const canSubmit = agreed && form.contactName && form.email && form.phone
    && form.address1 && form.city && form.state && form.zip && !!selSlot;

  return (
    <div>
      <ol className="steps" aria-label="Booking steps">
        {['Service & space', 'Add-ons', 'Date & time', 'Your details'].map((label, i) => (
          <li key={label}
            className={`stepchip ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}`}
            aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="n">{step > i + 1 ? '✓' : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <div className="wizwrap">
        <div>
          {/* ---------------- step 1 ---------------- */}
          {step === 1 && (
            <div>
              <div className="field">
                <span className="flabel">What kind of cleaning do you need?</span>
                <div className="radiocards">
                  {services.map((s) => (
                    <div className="rc" key={s.id}>
                      <input type="radio" name="svc" id={`svc-${s.id}`} value={s.id}
                        checked={serviceId === s.id} onChange={() => setServiceId(s.id)} />
                      <label htmlFor={`svc-${s.id}`}>
                        <b>{s.name}</b>
                        <span>{s.description || (s.ratePerSqFt ? `${money(s.ratePerSqFt)}/sq ft` : '')}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="f2">
                {propertyTypes.length > 0 && (
                  <div className="field">
                    <label htmlFor="ptype">Property type</label>
                    <select id="ptype" value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
                      {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="sqft">Square footage</label>
                  <input id="sqft" type="number" min={100} step={100} value={squareFeet}
                    onChange={(e) => setSquareFeet(Math.max(0, Number(e.target.value)))} />
                  <p className="hint">A rough estimate is fine — we confirm on site.</p>
                </div>
              </div>

              <div className="f3">
                <div className="field">
                  <label htmlFor="floors">Floors</label>
                  <input id="floors" type="number" min={1} value={floors}
                    onChange={(e) => setFloors(Math.max(1, Number(e.target.value)))} />
                </div>
                {floors >= 2 && (
                  <div className="field">
                    <label htmlFor="elev">Is there an elevator?</label>
                    <select id="elev" value={hasElevator ? 'y' : 'n'}
                      onChange={(e) => setHasElevator(e.target.value === 'y')}>
                      <option value="y">Yes</option><option value="n">No</option>
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="freq">How often?</label>
                  <select id="freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    {FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              {frequency !== 'one_time' && (
                <div className="note">
                  <b>Recurring service available.</b> This booking covers your <b>first visit</b> at
                  the one-time rate. We&apos;ll contact you with contract pricing for the rest.
                </div>
              )}

              <div className="wnav">
                <span />
                <button className="btn btn-navy" onClick={() => setStep(2)} disabled={!service}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ---------------- step 2 ---------------- */}
          {step === 2 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Anything extra?</h3>
              <p style={{ color: 'var(--slate)', fontSize: '.92rem', marginBottom: 20 }}>
                Optional. Each one adds to your price and your job length — both update live.
              </p>
              {addOns.length === 0 ? (
                <p style={{ color: 'var(--slate)' }}>No add-ons are offered right now.</p>
              ) : addOns.map((a) => {
                const on = (qty[a.id] ?? 0) > 0;
                return (
                  <div className={`addon ${on ? 'on' : ''}`} key={a.id}>
                    <input type="checkbox" id={`ao-${a.id}`} checked={on}
                      onChange={(e) => setQty({ ...qty, [a.id]: e.target.checked ? 1 : 0 })} />
                    <label className="txt" htmlFor={`ao-${a.id}`} style={{ margin: 0, cursor: 'pointer' }}>
                      <b>{a.name}</b>
                      <span>
                        {a.unitLabel}{a.minutesPerUnit ? ` · +${a.minutesPerUnit} min` : ''}
                        {a.description ? ` · ${a.description}` : ''}
                      </span>
                    </label>
                    {on && a.allowQuantity !== false && (
                      <input className="qty" type="number" min={1} value={qty[a.id]}
                        aria-label={`Quantity for ${a.name}`}
                        onChange={(e) => setQty({ ...qty, [a.id]: Math.max(1, Number(e.target.value)) })} />
                    )}
                    <span className="pr">{money(a.price ?? 0)}</span>
                  </div>
                );
              })}

              <div className="field" style={{ marginTop: 22 }}>
                <label htmlFor="notes">Anything else we should know?</label>
                <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special surfaces, sensitive areas, equipment to avoid, allergy concerns…" />
              </div>

              <div className="wnav">
                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn-navy" onClick={() => setStep(3)}>Continue →</button>
              </div>
            </div>
          )}

          {/* ---------------- step 3 ---------------- */}
          {step === 3 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Pick your date and time</h3>
              <p style={{ color: 'var(--slate)', fontSize: '.92rem', marginBottom: 20 }}>
                Only times we can actually staff are shown.
              </p>

              {quote && !quote.ok && quote.reason === 'requires_manual_quote' ? (
                <div className="warn">
                  <b>This job is larger than we schedule online.</b> Please{' '}
                  <a href="/contact">contact us</a> and we&apos;ll put together a custom quote.
                </div>
              ) : (
                <>
                  <div className="cal">
                    <div className="calhead">
                      <button type="button" aria-label="Previous month"
                        onClick={() => setMonth(month.minus({ months: 1 }))}>‹</button>
                      <b>{month.toFormat('LLLL yyyy')}</b>
                      <button type="button" aria-label="Next month"
                        onClick={() => setMonth(month.plus({ months: 1 }))}>›</button>
                    </div>
                    <div className="calgrid">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <span className="dow" key={i}>{d}</span>
                      ))}
                      {Array.from({ length: leading }).map((_, i) => <span key={`p${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const d = firstDay.plus({ days: i });
                        const iso = d.toFormat('yyyy-MM-dd');
                        const count = monthCounts[iso] ?? 0;
                        const disabled = count === 0 || iso < todayIso;
                        return (
                          <button key={iso} type="button"
                            className={`day ${selDate === iso ? 'sel' : ''}`}
                            disabled={disabled} onClick={() => pickDay(iso)}
                            aria-label={`${d.toFormat('cccc LLLL d')}${disabled ? ' — unavailable' : ` — ${count} times available`}`}>
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selDate && (
                    <div style={{ marginTop: 20 }}>
                      <b style={{ color: 'var(--navy)', fontSize: '.92rem' }}>
                        Available start times — {DateTime.fromISO(selDate, { zone: tz }).toFormat('LLLL d')}
                      </b>
                      {loadingSlots ? (
                        <p style={{ color: 'var(--slate)', fontSize: '.85rem', marginTop: 6 }}>Checking the schedule…</p>
                      ) : slots.length === 0 ? (
                        <p style={{ color: 'var(--slate)', fontSize: '.85rem', marginTop: 6 }}>
                          {slotReason === 'closed' ? "We're closed that day."
                            : slotReason === 'blackout' ? "We're closed that day."
                            : 'No times left on that day — try another.'}
                        </p>
                      ) : (
                        <>
                          <p style={{ fontSize: '.82rem', color: 'var(--slate)', marginTop: 3 }}>
                            {slots.length} available · job length {durationLabel(quote?.durationMinutes ?? 0)}
                          </p>
                          <div className="slots">
                            {slots.map((s) => (
                              <button key={s.start} type="button"
                                className={`slot ${selSlot?.start === s.start ? 'sel' : ''}`}
                                onClick={() => setSelSlot(s)}>
                                {s.startLabel}<small>–{s.endLabel}</small>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="note">
                    <b>Why some times aren&apos;t available.</b> We reserve a{' '}
                    {settings.scheduling.travelBufferMinutes}-minute travel window around every job
                    so your crew arrives on time and never rushes the space before yours.
                  </div>
                </>
              )}

              <div className="wnav">
                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-navy" onClick={() => setStep(4)} disabled={!canContinue3}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ---------------- step 4 ---------------- */}
          {step === 4 && (
            <div>
              <h3 style={{ marginBottom: 20 }}>Your details</h3>
              <div className="f2">
                <div className="field">
                  <label htmlFor="biz">Business name</label>
                  <input id="biz" value={form.businessName}
                    onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="cname">Contact name *</label>
                  <input id="cname" required value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                </div>
              </div>
              <div className="f2">
                <div className="field">
                  <label htmlFor="email">Email *</label>
                  <input id="email" type="email" required value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone *</label>
                  <input id="phone" type="tel" required value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="addr">Service address *</label>
                <input id="addr" required value={form.address1}
                  onChange={(e) => setForm({ ...form, address1: e.target.value })} />
              </div>
              <div className="f3">
                <div className="field">
                  <label htmlFor="city">City *</label>
                  <input id="city" required value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="state">State *</label>
                  <input id="state" required value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="zip">ZIP *</label>
                  <input id="zip" required value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="access">Access instructions</label>
                <textarea id="access" rows={3} value={form.accessNotes}
                  onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
                  placeholder="Alarm code handoff, key/fob pickup, loading dock, parking, who to call on arrival…" />
                <p className="hint">🔒 Shown only to your assigned crew. Never published or exported.</p>
              </div>

              {/* honeypot — visually hidden, never focusable */}
              <input type="text" name="website" value={website} tabIndex={-1} autoComplete="off"
                aria-hidden="true" onChange={(e) => setWebsite(e.target.value)}
                style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />

              <div style={{
                display: 'flex', gap: 11, alignItems: 'flex-start',
                background: 'var(--bg)', padding: 15, borderRadius: 'var(--rs)', marginTop: 6,
              }}>
                <input type="checkbox" id="agree" checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ width: 19, height: 19, marginTop: 2, accentColor: 'var(--blue-dark)' }} />
                <label htmlFor="agree" style={{ fontSize: '.86rem', fontWeight: 500, color: 'var(--slate)', margin: 0 }}>
                  I understand this is an <b style={{ color: 'var(--navy)' }}>estimate</b> and the final
                  invoice may be adjusted after an on-site walkthrough, with my confirmation.
                </label>
              </div>

              {error && <div className="err" role="alert">{error}</div>}

              <div className="wnav">
                <button className="btn btn-ghost" onClick={() => setStep(3)}>← Back</button>
                <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || submitting}>
                  {submitting ? 'Booking…' : 'Confirm Booking →'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------------- price panel ---------------- */}
        <aside className="pricepanel" aria-live="polite">
          <div className="ph"><span>Your estimate</span></div>
          <div className="pb">
            <div className="durbadge">
              ⏱ Estimated job length:&nbsp;
              <b>{quote?.ok ? durationLabel(quote.durationMinutes) : quote ? 'Custom quote' : '—'}</b>
            </div>
            {quote ? (
              <>
                {quote.lineItems.filter((l) => l.type !== 'modifier' || l.amount !== 0).map((l, i) => (
                  <div className="pline" key={i}>
                    <span>{l.label}</span>
                    <b>{money(l.amount)}</b>
                  </div>
                ))}
                {quote.lineItems.filter((l) => l.type === 'modifier' && l.amount === 0).map((l, i) => (
                  <div className="pline sub" key={`m${i}`}>
                    <span>{l.label}</span>
                    <b>{l.multiplier ? `×${l.multiplier.toFixed(2)}` : l.note ?? ''}</b>
                  </div>
                ))}
                <div className="pline" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 11 }}>
                  <span>Subtotal</span><b>{money(quote.subtotal)}</b>
                </div>
                <div className="pline">
                  <span>{quote.taxLabel} ({(quote.taxRate * 100).toFixed(quote.taxRate ? 3 : 0).replace(/\.?0+$/, '')}%)</span>
                  <b>{money(quote.taxAmount)}</b>
                </div>
                <div className="ptot">
                  <span>Estimated total</span><b>{money(quote.total)}</b>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--slate)', fontSize: '.88rem' }}>
                Choose a service and enter your square footage to see a price.
              </p>
            )}
            <p className="disclaim">
              This is an estimate based on the details you provided. Your final invoice may be
              adjusted after our on-site walkthrough — we&apos;ll confirm any change before work begins.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
