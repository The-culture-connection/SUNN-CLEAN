import Link from 'next/link';
import { loadCertifications } from '@/lib/data';
import { CERT_CATEGORY_LABELS } from '@sunnclean/shared';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certifications' };

const ORDER = ['insurance', 'safety', 'industry', 'environmental', 'personnel'];

export default async function Certifications() {
  const certs = await loadCertifications();
  const groups = ORDER
    .map((cat) => ({ cat, items: certs.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <section>
      <div className="wrap">
        <div className="sechead">
          <p className="eyebrow">Certifications</p>
          <h1 style={{ marginTop: 10 }}>Credentials you can check</h1>
          <p className="lede">Expired credentials drop off this page automatically.</p>
        </div>

        {certs.length === 0 ? (
          <div className="empty">
            <h3>Credentials are being uploaded</h3>
            <p>Need a certificate of insurance for your building manager? Call us and we&apos;ll send one over the same day.</p>
            <Link className="btn btn-primary" style={{ marginTop: 18 }} href="/contact">Contact us</Link>
          </div>
        ) : groups.map((g) => (
          <div key={g.cat}>
            <h2 className="catlabel">{CERT_CATEGORY_LABELS[g.cat] ?? g.cat}</h2>
            <div className="grid g2">
              {g.items.map((c) => (
                <article className="certcard" key={c.id}>
                  <div className="certbadge">
                    {c.badgeUrl ? <img src={c.badgeUrl} alt="" /> : '🛡️'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4>{c.name}</h4>
                    {c.issuer && <div className="iss">{c.issuer}</div>}
                    {c.description && <p>{c.description}</p>}
                    <div className="certmeta">
                      {c.credentialId && <span>ID<b>{c.credentialId}</b></span>}
                      {c.issueDate && <span>Issued<b>{c.issueDate}</b></span>}
                      {c.expiryDate && <span>Valid through<b>{c.expiryDate}</b></span>}
                    </div>
                    {c.documentUrl && (
                      <a className="btn btn-ghost btn-sm" style={{ marginTop: 13 }}
                        href={c.documentUrl} target="_blank" rel="noopener noreferrer">
                        ⬇ Download certificate
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
