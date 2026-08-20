import { loadReviews, loadPublicData } from '@/lib/data';
import { ReviewForm } from '@/components/ReviewForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reviews' };

export default async function Reviews() {
  const [{ reviews, count, average, distribution }, { services }] =
    await Promise.all([loadReviews(), loadPublicData()]);

  return (
    <section>
      <div className="wrap">
        <div className="sechead">
          <p className="eyebrow">Reviews</p>
          <h1 style={{ marginTop: 10 }}>What our customers say</h1>
          <p className="lede">
            Every review is read and published by a person here. Reviews tied to a real
            completed job carry a Verified badge.
          </p>
        </div>

        <div className="revsum">
          <div className="bigrate">
            <b>{count ? average.toFixed(1) : '—'}</b>
            <span className="st" aria-hidden>
              {'★'.repeat(Math.round(average))}{'☆'.repeat(5 - Math.round(average))}
            </span>
            <small>{count ? `Based on ${count} review${count === 1 ? '' : 's'}` : 'No reviews yet'}</small>
          </div>
          <div>
            {distribution.map((d) => (
              <div className="distrow" key={d.star}>
                <span className="lab">{d.star} star</span>
                <div className="bar">
                  <i style={{ width: count ? `${(d.count / count) * 100}%` : '0%' }} />
                </div>
                <span className="num">{d.count}</span>
              </div>
            ))}
            <div style={{ marginTop: 18 }}>
              <ReviewForm services={services} />
            </div>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="empty">
            <h3>No reviews published yet</h3>
            <p>If we&apos;ve cleaned for you, we&apos;d love to hear how it went.</p>
          </div>
        ) : (
          <div className="masonry">
            {reviews.map((r) => (
              <article className="revcard" key={r.id}>
                <div className="revtop">
                  <span className="stars" aria-label={`${r.rating} out of 5 stars`}>
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </span>
                  <span className={`badge ${r.verified ? 'ver' : 'unver'}`}>
                    {r.verified ? '✓ Verified' : 'Unverified'}
                  </span>
                </div>
                <h4>{r.title}</h4>
                <p>{r.body}</p>
                {r.photoUrls.length > 0 && (
                  <div className="revphotos">
                    {r.photoUrls.map((u, i) => <img key={i} src={u} alt="" loading="lazy" />)}
                  </div>
                )}
                {r.ownerResponse?.body && (
                  <div className="owner">
                    <b>Response from SUNN CLEAN</b>{r.ownerResponse.body}
                  </div>
                )}
                <div className="revfoot">
                  <span><b>{r.displayName}</b>{r.businessTypeLabel ? <><br />{r.businessTypeLabel}</> : null}</span>
                  <span style={{ textAlign: 'right' }}>
                    {r.serviceName}<br />
                    {new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
