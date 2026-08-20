import Link from 'next/link';
import { loadGallery } from '@/lib/data';
import { BeforeAfter } from '@/components/BeforeAfter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Before & After' };

export default async function Gallery() {
  const pairs = await loadGallery();
  return (
    <section>
      <div className="wrap">
        <div className="sechead">
          <p className="eyebrow">Our work</p>
          <h1 style={{ marginTop: 10 }}>Before &amp; after</h1>
          <p className="lede">Drag each handle to reveal the result.</p>
        </div>
        {pairs.length === 0 ? (
          <div className="empty">
            <h3>Photos coming soon</h3>
            <p>We&apos;re gathering before-and-after shots from recent jobs. Check back shortly.</p>
            <Link className="btn btn-primary" style={{ marginTop: 18 }} href="/book">Book a cleaning</Link>
          </div>
        ) : (
          <div className="grid g2">
            {pairs.map((p) => (
              <BeforeAfter key={p.id} beforeUrl={p.beforeUrl} afterUrl={p.afterUrl}
                caption={p.caption} meta={[p.serviceName, p.jobLengthLabel].filter(Boolean).join(' · ')} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
