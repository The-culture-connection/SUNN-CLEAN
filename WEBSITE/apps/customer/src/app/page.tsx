import Link from 'next/link';
import { loadPublicData, loadGallery, loadReviews, loadCertifications } from '@/lib/data';
import { money } from '@/components/Money';
import { BeforeAfter } from '@/components/BeforeAfter';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [{ settings, services }, gallery, reviewData, certs] = await Promise.all([
    loadPublicData(), loadGallery(), loadReviews(), loadCertifications(),
  ]);
  const c = settings.content;
  const b = settings.business;
  const featuredGallery = gallery.filter((g) => g.featured).concat(gallery).slice(0, 2);
  const featuredReview = reviewData.reviews.find((r) => r.featured) ?? reviewData.reviews[0];

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <div className="hero">
        <div className="wrap">
          <div>
            <p className="eyebrow">Commercial cleaning{certs.length ? ' · Licensed & insured' : ''}</p>
            <h1 style={{ marginTop: 12 }}>{c.heroHeadline}</h1>
            <p className="lede">{c.heroSubhead}</p>
            <div className="herobtns">
              <Link className="btn btn-primary" href="/book">Get My Price &amp; Book →</Link>
              {gallery.length > 0 && (
                <Link className="btn btn-ghost" href="/gallery">See Before &amp; After</Link>
              )}
            </div>
            {(b.yearsInBusiness || b.businessesServed || reviewData.count > 0) && (
              <div className="herostats">
                {b.yearsInBusiness && <div><b>{b.yearsInBusiness}</b><span>Years in business</span></div>}
                {b.businessesServed && <div><b>{b.businessesServed}</b><span>Businesses served</span></div>}
                {reviewData.count > 0 && (
                  <div><b>{reviewData.average.toFixed(1)}</b><span>Average rating</span></div>
                )}
                {certs.length > 0 && <div><b>{certs.length}</b><span>Credentials on file</span></div>}
              </div>
            )}
          </div>

          <div className="heroCard">
            <h4>What we do</h4>
            {services.length === 0 ? (
              <p style={{ color: 'var(--slate)', fontSize: '.92rem' }}>
                Services are being set up. Give us a call and we&apos;ll quote your space directly.
              </p>
            ) : (
              <ul style={{ listStyle: 'none' }}>
                {services.slice(0, 5).map((s) => (
                  <li key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    padding: '11px 0', borderBottom: '1px dashed var(--line)', fontSize: '.92rem',
                  }}>
                    <span style={{ color: 'var(--slate)' }}>{s.name}</span>
                    <b style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                      {s.minimumCharge ? `from ${money(s.minimumCharge)}` : 'Get a price'}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-navy" style={{ width: '100%', marginTop: 16 }} href="/book">
              Price my space
            </Link>
            <p style={{ fontSize: '.75rem', color: 'var(--slate)', textAlign: 'center', marginTop: 10 }}>
              No card required · No obligation
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- mission ---------------- */}
      <section id="mission">
        <div className="wrap mission">
          <div>
            <p className="eyebrow">{c.missionHeading}</p>
            <h2 style={{ margin: '10px 0 20px' }}>Why we do this</h2>
            <p className="lede">
              Reliable, high-quality commercial cleaning, delivered by people who care how your
              space looks when your team walks in.
            </p>
          </div>
          <div>
            <blockquote className="missionQuote">{c.missionStatement}</blockquote>
            {c.values?.length > 0 && (
              <div className="pillars">
                {c.values.map((v, i) => (
                  <div className="pillar" key={i}>
                    <span className="dot">{i + 1}</span>
                    <div><b>{v.title}</b><p>{v.body}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- services ---------------- */}
      {services.length > 0 && (
        <section className="bg-soft">
          <div className="wrap">
            <div className="sechead">
              <p className="eyebrow">What we clean</p>
              <h2 style={{ marginTop: 10 }}>Built for commercial spaces</h2>
              <p className="lede">Every price is calculated from your actual square footage — not a guess.</p>
            </div>
            <div className="grid g3">
              {services.slice(0, 6).map((s) => (
                <article className="card" key={s.id}>
                  <h3>{s.name}</h3>
                  {s.description && <p>{s.description}</p>}
                  {(s.minimumCharge || s.ratePerSqFt) && (
                    <div className="price-from">
                      {s.minimumCharge ? <>From <b>{money(s.minimumCharge)}</b></> : null}
                      {s.ratePerSqFt ? <> · {money(s.ratePerSqFt)}/sq ft</> : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div className="center mt-l"><Link className="btn btn-navy" href="/book">Get your instant price →</Link></div>
          </div>
        </section>
      )}

      {/* ---------------- before & after ---------------- */}
      {featuredGallery.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sechead">
              <p className="eyebrow">Proof, not promises</p>
              <h2 style={{ marginTop: 10 }}>Before &amp; after</h2>
              <p className="lede">Drag the handle to see the difference.</p>
            </div>
            <div className="grid g2">
              {featuredGallery.map((g) => (
                <BeforeAfter key={g.id} beforeUrl={g.beforeUrl} afterUrl={g.afterUrl}
                  caption={g.caption} meta={g.jobLengthLabel} />
              ))}
            </div>
            <div className="center mt-l"><Link className="btn btn-ghost" href="/gallery">See the full gallery</Link></div>
          </div>
        </section>
      )}

      {/* ---------------- trust ---------------- */}
      {(certs.length > 0 || featuredReview) && (
        <section className="bg-navy sec-tight">
          <div className="wrap g2r">
            <div>
              <h2 style={{ marginBottom: 14 }}>
                {certs.length > 0 ? 'Fully credentialed. Every job, every time.' : 'Trusted by local businesses'}
              </h2>
              {certs.length > 0 && (
                <>
                  <p style={{ color: '#b9d4e4' }}>
                    Insurance, safety training and industry credentials — published and kept current.
                  </p>
                  <div className="certstrip">
                    {certs.slice(0, 6).map((x) => <span className="certpill" key={x.id}>✓ {x.name}</span>)}
                  </div>
                  <Link className="btn btn-primary" style={{ marginTop: 22 }} href="/certifications">
                    View all certifications
                  </Link>
                </>
              )}
            </div>
            {featuredReview && (
              <div style={{
                background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
                borderRadius: 16, padding: 26,
              }}>
                <div className="stars" style={{ fontSize: '1.3rem' }}>
                  {'★'.repeat(featuredReview.rating)}{'☆'.repeat(5 - featuredReview.rating)}
                </div>
                <p style={{ fontSize: '1.05rem', color: '#fff', margin: '12px 0 18px', lineHeight: 1.55 }}>
                  “{featuredReview.title}” — {featuredReview.body.slice(0, 180)}
                  {featuredReview.body.length > 180 ? '…' : ''}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.85rem', gap: 10 }}>
                  <div>
                    <b style={{ color: '#fff', display: 'block' }}>{featuredReview.displayName}</b>
                    <span style={{ color: '#9fc0d4' }}>{featuredReview.businessTypeLabel}</span>
                  </div>
                  {featuredReview.verified && <span className="badge ver">✓ Verified</span>}
                </div>
                <Link className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 20 }} href="/reviews">
                  Read all reviews
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------- CTA ---------------- */}
      <section className="bg-pale">
        <div className="wrap center">
          <h2>Ready for a cleaner space?</h2>
          <p className="lede" style={{ margin: '14px auto 26px' }}>
            Pick your service, see your price, choose your time.
          </p>
          <Link className="btn btn-primary" href="/book">Book a Cleaning →</Link>
        </div>
      </section>
    </>
  );
}
