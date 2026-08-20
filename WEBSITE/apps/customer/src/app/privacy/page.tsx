import { getSettings } from '@sunnclean/shared';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy Policy' };

export default async function Page() {
  const s = await getSettings();
  return (
    <section>
      <div className="wrap" style={{ maxWidth: 760 }}>
        <h1>Privacy Policy</h1>
        <div className="warn" style={{ marginTop: 20 }}>
          <b>Placeholder.</b> This page needs real content reviewed by a lawyer before launch.
          Add it in the admin portal under Settings → Content.
        </div>
        <p className="lede" style={{ marginTop: 20 }}>
          For questions about this policy, contact {s.business.legalName || s.business.displayName}
          {s.business.email ? ` at ${s.business.email}` : ''}.
        </p>
      </div>
    </section>
  );
}
