'use client';

import { useEffect, useState } from 'react';
import type { CatalogItem } from '@sunnclean/shared';
import { Err, Toggle, money, durationLabel, useAction } from '@/components/ui';

/** Numbers live in the draft as strings so a half-typed "0.1" is not eaten. */
interface Draft {
  id: string;
  kind: CatalogItem['kind'];
  name: string;
  description: string;
  active: boolean;
  order: string;
  ratePerSqFt: string;
  minimumCharge: string;
  productionRate: string;
  price: string;
  unitLabel: string;
  minutesPerUnit: string;
  allowQuantity: boolean;
}

function toDraft(i: CatalogItem): Draft {
  return {
    id: i.id,
    kind: i.kind,
    name: i.name ?? '',
    description: i.description ?? '',
    active: i.active ?? true,
    order: String(i.order ?? 0),
    ratePerSqFt: String(i.ratePerSqFt ?? 0),
    minimumCharge: String(i.minimumCharge ?? 0),
    productionRate: String(i.productionRateSqFtPerCleanerHour ?? 0),
    price: String(i.price ?? 0),
    unitLabel: i.unitLabel ?? '',
    minutesPerUnit: String(i.minutesPerUnit ?? 0),
    allowQuantity: i.allowQuantity ?? false,
  };
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function CatalogEditor({ services, addOns }: { services: CatalogItem[]; addOns: CatalogItem[] }) {
  const { run, pending, error } = useAction();
  const [drafts, setDrafts] = useState<Draft[]>(() => [...services, ...addOns].map(toDraft));
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setDrafts([...services, ...addOns].map(toDraft));
  }, [services, addOns]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
    setSaved('');
  }

  async function save(d: Draft) {
    const payload = d.kind === 'service'
      ? {
        id: d.id, kind: 'service', name: d.name, description: d.description,
        active: d.active, order: d.order, ratePerSqFt: d.ratePerSqFt,
        minimumCharge: d.minimumCharge, productionRateSqFtPerCleanerHour: d.productionRate,
      }
      : {
        id: d.id, kind: 'addon', name: d.name, description: d.description,
        active: d.active, order: d.order, price: d.price, unitLabel: d.unitLabel,
        minutesPerUnit: d.minutesPerUnit, allowQuantity: d.allowQuantity,
      };
    const res = await run('/api/catalog', payload);
    if (res) setSaved(d.id);
  }

  async function remove(d: Draft) {
    const ok = window.confirm(
      `Delete "${d.name || 'this item'}"? Bookings already taken keep the price they were quoted.`,
    );
    if (!ok) return;
    await run('/api/catalog', { id: d.id }, 'DELETE');
  }

  async function addService() {
    await run('/api/catalog', {
      kind: 'service', name: 'New service', description: '', active: false,
      order: services.length + 1, ratePerSqFt: 0, minimumCharge: 0,
      productionRateSqFtPerCleanerHour: 1000,
    });
  }

  async function addAddOn() {
    await run('/api/catalog', {
      kind: 'addon', name: 'New add-on', description: '', active: false,
      order: addOns.length + 1, price: 0, unitLabel: '', minutesPerUnit: 0,
      allowQuantity: false,
    });
  }

  const serviceDrafts = drafts.filter((d) => d.kind === 'service');
  const addOnDrafts = drafts.filter((d) => d.kind === 'addon');
  const nothingYet = drafts.length === 0;

  return (
    <>
      <div className="phead">
        <div>
          <h1>Services &amp; Add-ons</h1>
          <p>Your price list. Everything a customer can pick online starts here.</p>
        </div>
      </div>

      {nothingYet && (
        <div className="note">
          <b>Nothing is priced yet.</b> No prices are built into this website — every rate comes
          from this page. Until you add at least one active service with a rate, a minimum charge
          and a coverage rate, customers cannot book online. Start with your most common job,
          save it, then add the rest.
        </div>
      )}

      <Err>{error}</Err>

      {/* ------------------------------- services ------------------------------ */}

      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch">
          <h3>Services</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={addService} disabled={pending}>
            + Add service
          </button>
        </div>
        <div className="cb">
          <div className="note" style={{ marginTop: 0 }}>
            <b>How a service is priced.</b> Square feet × your rate per square foot, then the
            property type multiplier, and if that lands under your minimum charge the minimum
            wins. The coverage rate below decides how long the job is booked for.
          </div>

          {serviceDrafts.length === 0 && (
            <p className="hint">No services yet. Add your first one above.</p>
          )}

          {serviceDrafts.map((d) => (
            <div className="acard" key={d.id} style={{ marginBottom: 14 }}>
              <div className="ch">
                <h3>{d.name || 'Untitled service'}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`chip ${d.active ? 'c-good' : 'c-mute'}`}>
                    {d.active ? 'Bookable' : 'Hidden'}
                  </span>
                  <Toggle on={d.active} label={`${d.name} active`}
                    onChange={(v) => patch(d.id, { active: v })} />
                </div>
              </div>
              <div className="cb">
                <div className="f2">
                  <div className="field">
                    <label htmlFor={`sname-${d.id}`}>Service name</label>
                    <input id={`sname-${d.id}`} value={d.name}
                      onChange={(e) => patch(d.id, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`sdesc-${d.id}`}>Description customers see</label>
                    <input id={`sdesc-${d.id}`} value={d.description}
                      onChange={(e) => patch(d.id, { description: e.target.value })} />
                  </div>
                </div>

                <div className="f3">
                  <div className="field">
                    <label htmlFor={`srate-${d.id}`}>Price per square foot</label>
                    <input id={`srate-${d.id}`} type="number" min={0} step={0.01} value={d.ratePerSqFt}
                      onChange={(e) => patch(d.id, { ratePerSqFt: e.target.value })} />
                    <div className="hint">
                      A 4,000 sq ft job at this rate quotes {money(num(d.ratePerSqFt) * 4000)} before
                      the property multiplier.
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`smin-${d.id}`}>Minimum charge</label>
                    <input id={`smin-${d.id}`} type="number" min={0} step={1} value={d.minimumCharge}
                      onChange={(e) => patch(d.id, { minimumCharge: e.target.value })} />
                    <div className="hint">
                      The least you will do this job for, however small the space.
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`sprod-${d.id}`}>Square feet one cleaner covers per hour</label>
                    <input id={`sprod-${d.id}`} type="number" min={1} step={10} value={d.productionRate}
                      onChange={(e) => patch(d.id, { productionRate: e.target.value })} />
                    <div className="hint">
                      This is what decides how long the job is scheduled for, so it also decides
                      how many other jobs fit in the day. At this number, two cleaners take about{' '}
                      {durationLabel(num(d.productionRate) > 0
                        ? Math.round((4000 / num(d.productionRate) / 2) * 60)
                        : 0)} on a 4,000 sq ft job. Check it against a few jobs you have actually
                      done and adjust — if crews keep finishing early, raise it; if they run over,
                      lower it.
                    </div>
                  </div>
                </div>

                <div className="setrow">
                  <div className="sl">
                    <b>Order on the website</b>
                    <span>Lower numbers show first.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} step={1} value={d.order} style={{ width: 90 }}
                      aria-label={`${d.name} order`}
                      onChange={(e) => patch(d.id, { order: e.target.value })} />
                    {saved === d.id && <span className="chip c-good">Saved</span>}
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => remove(d)} disabled={pending}>Delete</button>
                    <button type="button" className="btn btn-navy btn-sm"
                      onClick={() => save(d)} disabled={pending}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* -------------------------------- add-ons ------------------------------ */}

      <div className="acard">
        <div className="ch">
          <h3>Add-ons</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={addAddOn} disabled={pending}>
            + Add add-on
          </button>
        </div>
        <div className="cb">
          <div className="note" style={{ marginTop: 0 }}>
            <b>Add-ons are extras.</b> A flat price on top of the service, plus the extra minutes
            it takes so the schedule stays honest. Tick &quot;let them choose how many&quot; when the
            extra repeats — three restrooms, four fridges.
          </div>

          {addOnDrafts.length === 0 && (
            <p className="hint">No add-ons yet. They are optional — plenty of businesses run without any.</p>
          )}

          {addOnDrafts.map((d) => (
            <div className="acard" key={d.id} style={{ marginBottom: 14 }}>
              <div className="ch">
                <h3>{d.name || 'Untitled add-on'}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`chip ${d.active ? 'c-good' : 'c-mute'}`}>
                    {d.active ? 'Bookable' : 'Hidden'}
                  </span>
                  <Toggle on={d.active} label={`${d.name} active`}
                    onChange={(v) => patch(d.id, { active: v })} />
                </div>
              </div>
              <div className="cb">
                <div className="f2">
                  <div className="field">
                    <label htmlFor={`aname-${d.id}`}>Add-on name</label>
                    <input id={`aname-${d.id}`} value={d.name}
                      onChange={(e) => patch(d.id, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`adesc-${d.id}`}>Description customers see</label>
                    <input id={`adesc-${d.id}`} value={d.description}
                      onChange={(e) => patch(d.id, { description: e.target.value })} />
                  </div>
                </div>

                <div className="f3">
                  <div className="field">
                    <label htmlFor={`aprice-${d.id}`}>Price for one</label>
                    <input id={`aprice-${d.id}`} type="number" min={0} step={0.01} value={d.price}
                      onChange={(e) => patch(d.id, { price: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`aunit-${d.id}`}>What one is</label>
                    <input id={`aunit-${d.id}`} value={d.unitLabel} placeholder="per restroom"
                      onChange={(e) => patch(d.id, { unitLabel: e.target.value })} />
                    <div className="hint">Shown next to the price, e.g. &quot;per restroom&quot;.</div>
                  </div>
                  <div className="field">
                    <label htmlFor={`amins-${d.id}`}>Extra minutes for one</label>
                    <input id={`amins-${d.id}`} type="number" min={0} step={5} value={d.minutesPerUnit}
                      onChange={(e) => patch(d.id, { minutesPerUnit: e.target.value })} />
                    <div className="hint">Added to the visit so the crew is not rushed.</div>
                  </div>
                </div>

                <div className="setrow">
                  <div className="sl">
                    <b>Let them choose how many</b>
                    <span>Off means it is a simple yes or no, priced once.</span>
                  </div>
                  <Toggle on={d.allowQuantity} label={`${d.name} allows quantity`}
                    onChange={(v) => patch(d.id, { allowQuantity: v })} />
                </div>

                <div className="setrow">
                  <div className="sl">
                    <b>Order on the website</b>
                    <span>Lower numbers show first.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} step={1} value={d.order} style={{ width: 90 }}
                      aria-label={`${d.name} order`}
                      onChange={(e) => patch(d.id, { order: e.target.value })} />
                    {saved === d.id && <span className="chip c-good">Saved</span>}
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => remove(d)} disabled={pending}>Delete</button>
                    <button type="button" className="btn btn-navy btn-sm"
                      onClick={() => save(d)} disabled={pending}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
