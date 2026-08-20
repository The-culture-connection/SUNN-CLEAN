'use client';

import { useEffect, useState } from 'react';
// Type-only: a runtime import from the shared package would pull firebase-admin
// into the browser bundle. The server page loads the settings and passes them in.
import type { Settings } from '@sunnclean/shared';
import { Err, Toggle, useAction } from '@/components/ui';

export interface SettingsEditorProps {
  settings: Settings;
}

/** Numbers live as strings so a half-typed "8." is not eaten while you type. */
interface Draft {
  business: {
    legalName: string; displayName: string; tagline: string; phone: string; email: string;
    addressLine1: string; addressLine2: string; timezone: string; serviceArea: string;
    serviceAreaNote: string; yearsInBusiness: string; businessesServed: string;
  };
  scheduling: {
    travelBufferMinutes: string; quotingCrewHeadcount: string; minLeadTimeHours: string;
    maxHorizonDays: string; minJobMinutes: string; maxJobMinutes: string;
    slotGranularityMinutes: string; setupMinutes: string; autoConfirmBookings: boolean;
  };
  invoicing: {
    taxRatePercent: string; taxLabel: string; paymentTermsDays: string;
    paymentTermsLabel: string; remitToInstructions: string; invoiceFooter: string;
    invoiceNumberPrefix: string;
  };
  content: {
    missionStatement: string; missionHeading: string; heroHeadline: string;
    heroSubhead: string; aboutBody: string; values: { title: string; body: string }[];
  };
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** 0.08875 renders as "8.875" without picking up floating-point noise. */
function toPercent(fraction: number): string {
  const pct = (fraction ?? 0) * 100;
  return String(Number(pct.toFixed(6)));
}

function toDraft(s: Settings): Draft {
  return {
    business: {
      legalName: s.business.legalName ?? '',
      displayName: s.business.displayName ?? '',
      tagline: s.business.tagline ?? '',
      phone: s.business.phone ?? '',
      email: s.business.email ?? '',
      addressLine1: s.business.addressLine1 ?? '',
      addressLine2: s.business.addressLine2 ?? '',
      timezone: s.business.timezone || 'America/New_York',
      serviceArea: s.business.serviceArea ?? '',
      serviceAreaNote: s.business.serviceAreaNote ?? '',
      yearsInBusiness: s.business.yearsInBusiness ?? '',
      businessesServed: s.business.businessesServed ?? '',
    },
    scheduling: {
      travelBufferMinutes: String(s.scheduling.travelBufferMinutes ?? 60),
      quotingCrewHeadcount: String(s.scheduling.quotingCrewHeadcount ?? 2),
      minLeadTimeHours: String(s.scheduling.minLeadTimeHours ?? 24),
      maxHorizonDays: String(s.scheduling.maxHorizonDays ?? 60),
      minJobMinutes: String(s.scheduling.minJobMinutes ?? 120),
      maxJobMinutes: String(s.scheduling.maxJobMinutes ?? 600),
      slotGranularityMinutes: String(s.scheduling.slotGranularityMinutes ?? 30),
      setupMinutes: String(s.scheduling.setupMinutes ?? 20),
      autoConfirmBookings: s.scheduling.autoConfirmBookings ?? false,
    },
    invoicing: {
      taxRatePercent: toPercent(s.invoicing.taxRate ?? 0),
      taxLabel: s.invoicing.taxLabel ?? 'Tax',
      paymentTermsDays: String(s.invoicing.paymentTermsDays ?? 15),
      paymentTermsLabel: s.invoicing.paymentTermsLabel ?? '',
      remitToInstructions: s.invoicing.remitToInstructions ?? '',
      invoiceFooter: s.invoicing.invoiceFooter ?? '',
      invoiceNumberPrefix: s.invoicing.invoiceNumberPrefix || 'INV',
    },
    content: {
      missionStatement: s.content.missionStatement ?? '',
      missionHeading: s.content.missionHeading ?? '',
      heroHeadline: s.content.heroHeadline ?? '',
      heroSubhead: s.content.heroSubhead ?? '',
      aboutBody: s.content.aboutBody ?? '',
      values: (s.content.values ?? []).map((v) => ({ title: v.title ?? '', body: v.body ?? '' })),
    },
  };
}

export function SettingsEditor({ settings }: SettingsEditorProps) {
  const { run, pending, error } = useAction();
  const [d, setD] = useState<Draft>(() => toDraft(settings));
  const [saved, setSaved] = useState(false);

  // Re-sync once router.refresh() brings the saved document back down.
  useEffect(() => { setD(toDraft(settings)); }, [settings]);

  function biz(change: Partial<Draft['business']>) {
    setD((s) => ({ ...s, business: { ...s.business, ...change } })); setSaved(false);
  }
  function sch(change: Partial<Draft['scheduling']>) {
    setD((s) => ({ ...s, scheduling: { ...s.scheduling, ...change } })); setSaved(false);
  }
  function inv(change: Partial<Draft['invoicing']>) {
    setD((s) => ({ ...s, invoicing: { ...s.invoicing, ...change } })); setSaved(false);
  }
  function con(change: Partial<Draft['content']>) {
    setD((s) => ({ ...s, content: { ...s.content, ...change } })); setSaved(false);
  }

  function patchValue(index: number, change: Partial<{ title: string; body: string }>) {
    con({ values: d.content.values.map((v, i) => (i === index ? { ...v, ...change } : v)) });
  }

  async function save() {
    const res = await run('/api/settings', {
      business: d.business,
      scheduling: {
        ...d.scheduling,
        travelBufferMinutes: d.scheduling.travelBufferMinutes,
        autoConfirmBookings: d.scheduling.autoConfirmBookings,
      },
      invoicing: {
        // Stored as a fraction; the box above shows it as a percentage.
        taxRate: num(d.invoicing.taxRatePercent) / 100,
        taxLabel: d.invoicing.taxLabel,
        paymentTermsDays: d.invoicing.paymentTermsDays,
        paymentTermsLabel: d.invoicing.paymentTermsLabel,
        remitToInstructions: d.invoicing.remitToInstructions,
        invoiceFooter: d.invoicing.invoiceFooter,
        invoiceNumberPrefix: d.invoicing.invoiceNumberPrefix,
      },
      content: d.content,
    });
    if (res) setSaved(true);
  }

  return (
    <>
      <div className="phead">
        <div>
          <h1>Settings</h1>
          <p>Your business details, how the calendar behaves, and the words on your website.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && <span className="chip c-good">Saved</span>}
          <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
            Save all settings
          </button>
        </div>
      </div>

      <div className="note">
        <b>What saving does.</b> Scheduling changes take effect on the next visitor who looks
        for a slot. Pricing and tax apply to <b>new</b> quotes only — a booking you have already
        taken keeps the numbers it was quoted at, so nobody ever gets a surprise invoice.
      </div>

      <Err>{error}</Err>

      {/* ------------------------------- business ------------------------------ */}
      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch"><h3>Your business</h3></div>
        <div className="cb">
          <div className="f2">
            <div className="field">
              <label htmlFor="legalName">Legal name</label>
              <input id="legalName" value={d.business.legalName}
                onChange={(e) => biz({ legalName: e.target.value })} />
              <p className="hint">Goes on invoices and contracts.</p>
            </div>
            <div className="field">
              <label htmlFor="displayName">Name customers see</label>
              <input id="displayName" value={d.business.displayName}
                onChange={(e) => biz({ displayName: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="tagline">Tagline</label>
            <input id="tagline" value={d.business.tagline}
              onChange={(e) => biz({ tagline: e.target.value })} />
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" value={d.business.phone}
                onChange={(e) => biz({ phone: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="bizEmail">Email</label>
              <input id="bizEmail" type="email" value={d.business.email}
                onChange={(e) => biz({ email: e.target.value })} />
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="addr1">Address line 1</label>
              <input id="addr1" value={d.business.addressLine1}
                onChange={(e) => biz({ addressLine1: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="addr2">Address line 2</label>
              <input id="addr2" value={d.business.addressLine2}
                onChange={(e) => biz({ addressLine2: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="tz">Time zone</label>
            <input id="tz" value={d.business.timezone} placeholder="America/New_York"
              onChange={(e) => biz({ timezone: e.target.value })} />
            <p className="hint">
              Every booking time, operating hour and blackout date is read in this zone. Use the
              full name, like <b>America/New_York</b> or <b>America/Chicago</b> — not &ldquo;EST&rdquo;,
              which does not follow daylight saving.
            </p>
          </div>

          <div className="field">
            <label htmlFor="area">Service area</label>
            <input id="area" value={d.business.serviceArea}
              placeholder="Brooklyn, Queens and Lower Manhattan"
              onChange={(e) => biz({ serviceArea: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="areaNote">Service area note</label>
            <textarea id="areaNote" rows={2} value={d.business.serviceAreaNote}
              placeholder="Outside this area? Get in touch — we travel for larger contracts."
              onChange={(e) => biz({ serviceAreaNote: e.target.value })} />
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="years">Years in business</label>
              <input id="years" value={d.business.yearsInBusiness} placeholder="8"
                onChange={(e) => biz({ yearsInBusiness: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="served">Businesses served</label>
              <input id="served" value={d.business.businessesServed} placeholder="120+"
                onChange={(e) => biz({ businessesServed: e.target.value })} />
              <p className="hint">Shown as a headline figure on the website.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------ scheduling ----------------------------- */}
      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch"><h3>Scheduling</h3></div>
        <div className="cb">
          <div className="f3">
            <div className="field">
              <label htmlFor="buffer">Travel buffer (minutes)</label>
              <input id="buffer" type="number" min={0} step={5}
                value={d.scheduling.travelBufferMinutes}
                onChange={(e) => sch({ travelBufferMinutes: e.target.value })} />
              <p className="hint">
                The gap held between one job finishing and the next starting, so a crew is
                never double-booked across town. Nobody can book into it.
              </p>
            </div>
            <div className="field">
              <label htmlFor="headcount">Quoting crew headcount</label>
              <input id="headcount" type="number" min={1} step={1}
                value={d.scheduling.quotingCrewHeadcount}
                onChange={(e) => sch({ quotingCrewHeadcount: e.target.value })} />
              <p className="hint">
                Set this to your <b>smallest</b> crew. Quoting with a big crew makes every job
                look quicker than it is, and you end up running late on the ones the small
                crew takes.
              </p>
            </div>
            <div className="field">
              <label htmlFor="setup">Setup minutes per job</label>
              <input id="setup" type="number" min={0} step={5} value={d.scheduling.setupMinutes}
                onChange={(e) => sch({ setupMinutes: e.target.value })} />
              <p className="hint">Load-in, walkthrough and load-out, added to every job.</p>
            </div>
          </div>

          <div className="f3">
            <div className="field">
              <label htmlFor="lead">Minimum notice (hours)</label>
              <input id="lead" type="number" min={0} step={1} value={d.scheduling.minLeadTimeHours}
                onChange={(e) => sch({ minLeadTimeHours: e.target.value })} />
              <p className="hint">How far ahead someone must book.</p>
            </div>
            <div className="field">
              <label htmlFor="horizon">Booking window (days)</label>
              <input id="horizon" type="number" min={1} step={1} value={d.scheduling.maxHorizonDays}
                onChange={(e) => sch({ maxHorizonDays: e.target.value })} />
              <p className="hint">How far into the future the calendar opens.</p>
            </div>
            <div className="field">
              <label htmlFor="gran">Slot spacing (minutes)</label>
              <input id="gran" type="number" min={5} step={5}
                value={d.scheduling.slotGranularityMinutes}
                onChange={(e) => sch({ slotGranularityMinutes: e.target.value })} />
              <p className="hint">30 gives half-hourly start times.</p>
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="minjob">Shortest job (minutes)</label>
              <input id="minjob" type="number" min={15} step={15} value={d.scheduling.minJobMinutes}
                onChange={(e) => sch({ minJobMinutes: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="maxjob">Longest job (minutes)</label>
              <input id="maxjob" type="number" min={15} step={15} value={d.scheduling.maxJobMinutes}
                onChange={(e) => sch({ maxJobMinutes: e.target.value })} />
              <p className="hint">Anything longer is sent to you for a manual quote.</p>
            </div>
          </div>

          <div className="setrow">
            <div className="sl">
              <b>Confirm bookings automatically</b>
              <span>
                On, a customer&rsquo;s slot is theirs the moment they book. Off, it sits as
                pending until you say yes — safer while you are still learning how long jobs take.
              </span>
            </div>
            <Toggle on={d.scheduling.autoConfirmBookings} label="Auto-confirm bookings"
              onChange={(v) => sch({ autoConfirmBookings: v })} />
          </div>
        </div>
      </div>

      {/* ------------------------------ invoicing ------------------------------ */}
      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch"><h3>Invoicing</h3></div>
        <div className="cb">
          <div className="f3">
            <div className="field">
              <label htmlFor="tax">Tax rate (%)</label>
              <input id="tax" type="number" min={0} max={50} step={0.001}
                value={d.invoicing.taxRatePercent}
                onChange={(e) => inv({ taxRatePercent: e.target.value })} />
              <p className="hint">
                Enter it as a percentage — 8.875 for 8.875%. Sales tax on cleaning varies by
                state and sometimes by city, and some commercial work is exempt. Confirm your
                rate with your accountant rather than guessing.
              </p>
            </div>
            <div className="field">
              <label htmlFor="taxLabel">Tax label on the invoice</label>
              <input id="taxLabel" value={d.invoicing.taxLabel}
                placeholder="Sales tax" onChange={(e) => inv({ taxLabel: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="prefix">Invoice number prefix</label>
              <input id="prefix" value={d.invoicing.invoiceNumberPrefix}
                onChange={(e) => inv({ invoiceNumberPrefix: e.target.value })} />
              <p className="hint">Invoices number as PREFIX-2026-0001.</p>
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="termsDays">Payment terms (days)</label>
              <input id="termsDays" type="number" min={0} step={1}
                value={d.invoicing.paymentTermsDays}
                onChange={(e) => inv({ paymentTermsDays: e.target.value })} />
              <p className="hint">Sets the due date on every invoice you send.</p>
            </div>
            <div className="field">
              <label htmlFor="termsLabel">Terms wording</label>
              <input id="termsLabel" value={d.invoicing.paymentTermsLabel} placeholder="Net 15"
                onChange={(e) => inv({ paymentTermsLabel: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="remit">How to pay you</label>
            <textarea id="remit" rows={4} value={d.invoicing.remitToInstructions}
              placeholder="Cheques payable to SUNN Clean LLC, mailed to… / ACH details on request."
              onChange={(e) => inv({ remitToInstructions: e.target.value })} />
            <p className="hint">Printed on every invoice. Vague payment details are the most common reason an invoice sits unpaid.</p>
          </div>

          <div className="field">
            <label htmlFor="footer">Invoice footer</label>
            <textarea id="footer" rows={3} value={d.invoicing.invoiceFooter}
              placeholder="Thank you for your business. Questions? Call us on…"
              onChange={(e) => inv({ invoiceFooter: e.target.value })} />
          </div>
        </div>
      </div>

      {/* ------------------------------- content ------------------------------- */}
      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch"><h3>Website words</h3></div>
        <div className="cb">
          <div className="f2">
            <div className="field">
              <label htmlFor="heroHead">Headline on the front page</label>
              <input id="heroHead" value={d.content.heroHeadline}
                onChange={(e) => con({ heroHeadline: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="heroSub">Line underneath it</label>
              <input id="heroSub" value={d.content.heroSubhead}
                onChange={(e) => con({ heroSubhead: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="missionHeading">Mission heading</label>
            <input id="missionHeading" value={d.content.missionHeading}
              onChange={(e) => con({ missionHeading: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="mission">Mission statement</label>
            <textarea id="mission" rows={4} value={d.content.missionStatement}
              onChange={(e) => con({ missionStatement: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="about">About your business</label>
            <textarea id="about" rows={6} value={d.content.aboutBody}
              placeholder="Who you are, how you started, why a client should trust your crew in their building after hours."
              onChange={(e) => con({ aboutBody: e.target.value })} />
          </div>

          <div className="field" style={{ marginBottom: 8 }}>
            <span className="flabel">What you stand for</span>
            <div className="hint">
              Three or four is plenty. A short title and one honest sentence each.
            </div>
          </div>

          {d.content.values.length === 0 && (
            <p className="hint" style={{ marginBottom: 10 }}>Nothing listed yet.</p>
          )}

          {d.content.values.map((v, i) => (
            <div key={i} className="setrow" style={{ alignItems: 'flex-start' }}>
              <div className="sl" style={{ flex: 1 }}>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label htmlFor={`vt-${i}`}>Title</label>
                  <input id={`vt-${i}`} value={v.title}
                    onChange={(e) => patchValue(i, { title: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`vb-${i}`}>Description</label>
                  <textarea id={`vb-${i}`} rows={2} value={v.body}
                    onChange={(e) => patchValue(i, { body: e.target.value })} />
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => con({ values: d.content.values.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}

          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
            disabled={d.content.values.length >= 12}
            onClick={() => con({ values: [...d.content.values, { title: '', body: '' }] })}>
            + Add a value
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          Save all settings
        </button>
        {saved && <span className="chip c-good">Saved</span>}
      </div>
    </>
  );
}
