import { getSettings } from '@sunnclean/shared';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Our Mission' };

export default async function About() {
  const s = await getSettings();
  const c = s.content;
  return (
    <section>
      <div className="wrap" style={{ maxWidth: 780 }}>
        <p className="eyebrow">{c.missionHeading}</p>
        <h1 style={{ margin: '10px 0 24px' }}>Why we do this</h1>
        <blockquote className="missionQuote" style={{ fontSize: '1.45rem' }}>
          {c.missionStatement}
        </blockquote>
        {c.aboutBody && (
          <div style={{ marginTop: 30, whiteSpace: 'pre-wrap', color: 'var(--slate)', fontSize: '1.02rem' }}>
            {c.aboutBody}
          </div>
        )}
        {c.values?.length > 0 && (
          <div className="pillars" style={{ marginTop: 34 }}>
            {c.values.map((v, i) => (
              <div className="pillar" key={i}>
                <span className="dot">{i + 1}</span>
                <div><b>{v.title}</b><p>{v.body}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
