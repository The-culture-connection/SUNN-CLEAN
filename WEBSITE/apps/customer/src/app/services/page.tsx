import Link from 'next/link';
import { loadPublicData } from '@/lib/data';
import { money } from '@/components/Money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Services' };

export default async function Services() {
  const { services, addOns } = await loadPublicData();
  return (
    <section>
      <div className="wrap">
        <div className="sechead">
          <p className="eyebrow">Services</p>
          <h1 style={{ marginTop: 10 }}>Commercial cleaning, priced by the square foot</h1>
          <p className="lede">No walkthrough required to get a number.</p>
        </div>

        {services.length === 0 ? (
          <div className="empty">
            <h3>Our service list is being finalised</h3>
            <p>Give us a call and we&apos;ll quote your space directly.</p>
            <Link className="btn btn-primary" style={{ marginTop: 18 }} href="/contact">Contact us</Link>
          </div>
        ) : (
          <div className="grid g2">
            {services.map((s) => (
              <article className="card" key={s.id}>
                <h3>{s.name}</h3>
                {s.description && <p>{s.description}</p>}
                <div className="price-from">
                  {s.ratePerSqFt ? <>{money(s.ratePerSqFt)} per sq ft</> : 'Custom pricing'}
                  {s.minimumCharge ? <> · minimum <b>{money(s.minimumCharge)}</b></> : null}
                </div>
                <Link className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} href="/book">
                  Book this service →
                </Link>
              </article>
            ))}
          </div>
        )}

        {addOns.length > 0 && (
          <>
            <h2 style={{ marginTop: 52, marginBottom: 18 }}>Add-ons</h2>
            <div className="grid g3">
              {addOns.map((a) => (
                <article className="card" key={a.id}>
                  <h3 style={{ fontSize: '1rem' }}>{a.name}</h3>
                  {a.description && <p>{a.description}</p>}
                  <div className="price-from">
                    <b>{money(a.price ?? 0)}</b> {a.unitLabel}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="note" style={{ maxWidth: 760, margin: '34px auto 0' }}>
          <b>Pricing is transparent by design.</b> Your final invoice may be adjusted after an
          on-site walkthrough — but we confirm any change with you before work begins.
        </div>
      </div>
    </section>
  );
}
