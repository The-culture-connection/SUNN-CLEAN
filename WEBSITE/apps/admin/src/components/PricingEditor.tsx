'use client';

import { useEffect, useState } from 'react';
import type { PropertyType, Surcharge, SurchargeTrigger } from '@sunnclean/shared';
import { Err, Toggle, money, useAction } from '@/components/ui';

/* ---------------- minutes <-> "HH:MM" ---------------- */

function toTimeInput(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string): number {
  const [h, m] = value.split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0;
  return Math.max(0, Math.min(1439, hours * 60 + mins));
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const TRIGGERS: { value: SurchargeTrigger; label: string; help: string }[] = [
  { value: 'after_hours', label: 'Outside your normal hours', help: 'Added automatically when the job starts early or late.' },
  { value: 'weekend', label: 'Saturday or Sunday', help: 'Added automatically to weekend jobs.' },
  { value: 'holiday', label: 'Holiday', help: 'You add this one by hand on the booking.' },
  { value: 'no_elevator', label: 'Stairs only, no elevator', help: 'Added automatically when the site has no elevator and enough floors.' },
  { value: 'manual', label: 'Only when you add it', help: 'Never automatic — you choose it on the booking.' },
];

/* ---------------- drafts ---------------- */

/** `value` is held in the units shown on screen: 15 for 15%, 25 for $25. */
interface SurchargeDraft {
  id: string;
  name: string;
  description: string;
  type: 'percent' | 'flat';
  value: string;
  trigger: SurchargeTrigger;
  beforeMinute: number;
  afterMinute: number;
  minFloors: string;
  active: boolean;
  order: string;
}

interface TypeDraft {
  id: string;
  name: string;
  modifier: string;
  active: boolean;
  order: string;
}

/** 0.15 -> "15" without the floating-point tail. */
function percentText(fraction: number): string {
  return String(Math.round(fraction * 10000) / 100);
}

function toSurchargeDraft(s: Surcharge): SurchargeDraft {
  return {
    id: s.id,
    name: s.name ?? '',
    description: s.description ?? '',
    type: s.type ?? 'percent',
    value: s.type === 'percent' ? percentText(s.value ?? 0) : String(s.value ?? 0),
    trigger: s.trigger ?? 'manual',
    beforeMinute: s.beforeMinute ?? 7 * 60,
    afterMinute: s.afterMinute ?? 18 * 60,
    minFloors: String(s.minFloors ?? 2),
    active: s.active ?? false,
    order: String(s.order ?? 0),
  };
}

function toTypeDraft(p: PropertyType): TypeDraft {
  return {
    id: p.id,
    name: p.name ?? '',
    modifier: String(p.modifier ?? 1),
    active: p.active ?? true,
    order: String(p.order ?? 0),
  };
}

export function PricingEditor(
  { surcharges, propertyTypes }: { surcharges: Surcharge[]; propertyTypes: PropertyType[] },
) {
  const { run, pending, error } = useAction();
  const [rows, setRows] = useState<SurchargeDraft[]>(() => surcharges.map(toSurchargeDraft));
  const [types, setTypes] = useState<TypeDraft[]>(() => propertyTypes.map(toTypeDraft));
  const [saved, setSaved] = useState('');

  useEffect(() => { setRows(surcharges.map(toSurchargeDraft)); }, [surcharges]);
  useEffect(() => { setTypes(propertyTypes.map(toTypeDraft)); }, [propertyTypes]);

  function patchRow(id: string, change: Partial<SurchargeDraft>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));
    setSaved('');
  }

  function patchType(id: string, change: Partial<TypeDraft>) {
    setTypes((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));
    setSaved('');
  }

  async function saveSurcharge(r: SurchargeDraft) {
    const res = await run('/api/pricing', {
      target: 'surcharge',
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      // Percentages are typed as 15 and stored as 0.15.
      value: r.type === 'percent' ? num(r.value) / 100 : num(r.value),
      trigger: r.trigger,
      beforeMinute: r.beforeMinute,
      afterMinute: r.afterMinute,
      minFloors: r.minFloors,
      active: r.active,
      order: r.order,
    });
    if (res) setSaved(r.id);
  }

  async function saveType(t: TypeDraft) {
    const res = await run('/api/pricing', {
      target: 'propertyType',
      id: t.id,
      name: t.name,
      modifier: t.modifier,
      active: t.active,
      order: t.order,
    });
    if (res) setSaved(t.id);
  }

  async function addSurcharge() {
    await run('/api/pricing', {
      target: 'surcharge', name: 'New surcharge', description: '', type: 'percent',
      value: 0, trigger: 'manual', active: false, order: surcharges.length + 1,
    });
  }

  async function addType() {
    await run('/api/pricing', {
      target: 'propertyType', name: 'New property type', modifier: 1,
      active: true, order: propertyTypes.length + 1,
    });
  }

  async function remove(target: 'surcharge' | 'propertyType', id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? Bookings already taken keep the price they were quoted.`)) return;
    await run('/api/pricing', { target, id }, 'DELETE');
  }

  return (
    <>
      <div className="phead">
        <div>
          <h1>Surcharges &amp; Property Types</h1>
          <p>The extras and adjustments that sit on top of your base service price.</p>
        </div>
      </div>

      <Err>{error}</Err>

      {/* ------------------------------ surcharges ----------------------------- */}

      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch">
          <h3>Surcharges</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={addSurcharge} disabled={pending}>
            + Add surcharge
          </button>
        </div>
        <div className="cb">
          <div className="note" style={{ marginTop: 0 }}>
            <b>Only switched-on surcharges cost the customer anything.</b> A percentage is a share
            of the base price — type 15 for 15%. A flat amount is dollars added once. Leave one
            switched off while you make up your mind; it will sit here quietly at zero.
          </div>

          {rows.length === 0 && (
            <p className="hint">No surcharges yet. Plenty of jobs are priced fine without them.</p>
          )}
        </div>

        {rows.length > 0 && (
          <div className="cb flush">
            <table>
              <thead>
                <tr>
                  <th>Name &amp; description</th>
                  <th>Kind</th>
                  <th className="num">Amount</th>
                  <th>Applies when</th>
                  <th className="num">Order</th>
                  <th>On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const trigger = TRIGGERS.find((t) => t.value === r.trigger);
                  const showHours = r.trigger === 'after_hours';
                  const showFloors = r.trigger === 'no_elevator';
                  return (
                    <tr key={r.id}>
                      <td>
                        <input value={r.name} aria-label="Surcharge name"
                          onChange={(e) => patchRow(r.id, { name: e.target.value })} />
                        <input value={r.description} aria-label="Surcharge description"
                          placeholder="What this is for, in your own words"
                          style={{ marginTop: 6 }}
                          onChange={(e) => patchRow(r.id, { description: e.target.value })} />
                        {showHours && (
                          <div className="f2" style={{ marginTop: 8 }}>
                            <div>
                              <span className="hint">Anything starting before</span>
                              <input type="time" value={toTimeInput(r.beforeMinute)}
                                aria-label="Charged before this time"
                                onChange={(e) => patchRow(r.id, { beforeMinute: fromTimeInput(e.target.value) })} />
                            </div>
                            <div>
                              <span className="hint">…or at or after</span>
                              <input type="time" value={toTimeInput(r.afterMinute)}
                                aria-label="Charged from this time"
                                onChange={(e) => patchRow(r.id, { afterMinute: fromTimeInput(e.target.value) })} />
                            </div>
                          </div>
                        )}
                        {showFloors && (
                          <div style={{ marginTop: 8 }}>
                            <span className="hint">Only when the building has at least this many floors</span>
                            <input type="number" min={1} step={1} value={r.minFloors}
                              aria-label="Minimum floors"
                              onChange={(e) => patchRow(r.id, { minFloors: e.target.value })} />
                          </div>
                        )}
                      </td>
                      <td>
                        <select value={r.type} aria-label="Surcharge kind"
                          onChange={(e) => patchRow(r.id, { type: e.target.value === 'flat' ? 'flat' : 'percent' })}>
                          <option value="percent">Percentage</option>
                          <option value="flat">Flat amount</option>
                        </select>
                      </td>
                      <td className="num">
                        <input type="number" min={0} step={r.type === 'percent' ? 1 : 0.5}
                          value={r.value} aria-label="Surcharge amount"
                          onChange={(e) => patchRow(r.id, { value: e.target.value })} />
                        <div className="hint">
                          {r.type === 'percent'
                            ? `${num(r.value)}% — ${money(500 * num(r.value) / 100)} on a $500 job`
                            : `${money(num(r.value))} added once`}
                        </div>
                      </td>
                      <td>
                        <select value={r.trigger} aria-label="When this applies"
                          onChange={(e) => patchRow(r.id, { trigger: e.target.value as SurchargeTrigger })}>
                          {TRIGGERS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        {trigger && <div className="hint">{trigger.help}</div>}
                      </td>
                      <td className="num">
                        <input type="number" min={0} step={1} value={r.order} aria-label="Order"
                          style={{ width: 74 }}
                          onChange={(e) => patchRow(r.id, { order: e.target.value })} />
                      </td>
                      <td>
                        <Toggle on={r.active} label={`${r.name} active`}
                          onChange={(v) => patchRow(r.id, { active: v })} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {saved === r.id && <span className="chip c-good">Saved</span>}
                          <button type="button" className="btn btn-navy btn-sm"
                            onClick={() => saveSurcharge(r)} disabled={pending}>Save</button>
                          <button type="button" className="btn btn-ghost btn-sm"
                            onClick={() => remove('surcharge', r.id, r.name)} disabled={pending}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------- property types --------------------------- */}

      <div className="acard">
        <div className="ch">
          <h3>Property types</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={addType} disabled={pending}>
            + Add property type
          </button>
        </div>
        <div className="cb">
          <div className="note" style={{ marginTop: 0 }}>
            <b>1.00 means no change.</b> The customer picks their kind of building and the base
            price is multiplied by this number. Use 1.25 when that kind of work takes a quarter
            more effort, 0.90 when it is easier than average. Your minimum charge is applied
            after this, so a small job never drops below your floor.
          </div>

          {types.length === 0 && (
            <p className="hint">No property types yet. Add at least one — customers have to pick one to book.</p>
          )}
        </div>

        {types.length > 0 && (
          <div className="cb flush">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Multiplier</th>
                  <th className="num">Order</th>
                  <th>On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input value={t.name} aria-label="Property type name"
                        onChange={(e) => patchType(t.id, { name: e.target.value })} />
                    </td>
                    <td className="num">
                      <input type="number" min={0.1} step={0.05} value={t.modifier}
                        aria-label="Multiplier"
                        onChange={(e) => patchType(t.id, { modifier: e.target.value })} />
                      <div className="hint">
                        {num(t.modifier) === 1
                          ? 'No change to the price'
                          : `A $500 job becomes ${money(500 * num(t.modifier))}`}
                      </div>
                    </td>
                    <td className="num">
                      <input type="number" min={0} step={1} value={t.order} aria-label="Order"
                        style={{ width: 74 }}
                        onChange={(e) => patchType(t.id, { order: e.target.value })} />
                    </td>
                    <td>
                      <Toggle on={t.active} label={`${t.name} active`}
                        onChange={(v) => patchType(t.id, { active: v })} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {saved === t.id && <span className="chip c-good">Saved</span>}
                        <button type="button" className="btn btn-navy btn-sm"
                          onClick={() => saveType(t)} disabled={pending}>Save</button>
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => remove('propertyType', t.id, t.name)} disabled={pending}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
