import Link from 'next/link';
import type { Settings } from '@sunnclean/shared';

export function Header({ settings }: { settings: Settings }) {
  const b = settings.business;
  return (
    <header>
      <div className="wrap nav">
        <Link href="/" className="brand" aria-label={`${b.displayName} home`}>
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          <span className="wm">
            <b>{b.displayName}</b>
            <span>{b.tagline.toUpperCase()}</span>
          </span>
        </Link>
        <nav className="navlinks" aria-label="Main">
          <Link href="/services">Services</Link>
          <Link href="/gallery">Before &amp; After</Link>
          <Link href="/reviews">Reviews</Link>
          <Link href="/certifications">Certifications</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="navcta">
          {b.phone ? <a className="phone" href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a> : null}
          <Link className="btn btn-primary btn-sm" href="/book">Book a Cleaning</Link>
        </div>
      </div>
    </header>
  );
}

export function Footer({ settings }: { settings: Settings }) {
  const b = settings.business;
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <div className="brand" style={{ marginBottom: 14 }}>
              <img src="/logo-mark.png" alt="" width={38} height={34} />
              <span className="wm">
                <b style={{ color: '#fff' }}>{b.displayName}</b>
                <span style={{ color: '#9fc0d4' }}>{b.tagline.toUpperCase()}</span>
              </span>
            </div>
            <p>Commercial cleaning for offices, medical suites, retail and post-construction sites.</p>
          </div>
          <div>
            <h5>Services</h5>
            <ul>
              <li><Link href="/services">All services</Link></li>
              <li><Link href="/book">Get a price</Link></li>
              <li><Link href="/gallery">Before &amp; after</Link></li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link href="/about">Our mission</Link></li>
              <li><Link href="/reviews">Reviews</Link></li>
              <li><Link href="/certifications">Certifications</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              {b.phone ? <li><a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a></li> : null}
              {b.email ? <li><a href={`mailto:${b.email}`}>{b.email}</a></li> : null}
              {b.serviceArea ? <li>{b.serviceArea}</li> : null}
            </ul>
          </div>
        </div>
        <div className="fbot">
          <span>© {new Date().getFullYear()} {b.legalName || b.displayName}. All rights reserved.</span>
          <span><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></span>
        </div>
      </div>
    </footer>
  );
}
