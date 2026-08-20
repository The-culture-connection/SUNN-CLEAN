import { getSettings } from '@sunnclean/shared';
import { ContactForm } from '@/components/ContactForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contact' };

export default async function Contact() {
  const s = await getSettings();
  const b = s.business;
  return (
    <section>
      <div className="wrap g2r" style={{ alignItems: 'start' }}>
        <div>
          <p className="eyebrow">Contact</p>
          <h1 style={{ margin: '10px 0 18px' }}>Talk to a person</h1>
          <p className="lede">
            Questions about a quote, a multi-site contract, or a job that&apos;s too big to
            book online? Send a message and we&apos;ll get back to you.
          </p>
          <div style={{ marginTop: 26, display: 'grid', gap: 12 }}>
            {b.phone && <div><b style={{ color: 'var(--navy)' }}>Phone</b><br />
              <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a></div>}
            {b.email && <div><b style={{ color: 'var(--navy)' }}>Email</b><br />
              <a href={`mailto:${b.email}`}>{b.email}</a></div>}
            {b.serviceArea && <div><b style={{ color: 'var(--navy)' }}>Service area</b><br />
              <span style={{ color: 'var(--slate)' }}>{b.serviceArea}</span></div>}
          </div>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
