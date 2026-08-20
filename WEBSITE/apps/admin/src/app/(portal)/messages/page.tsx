import { listContactMessages } from '@sunnclean/shared';

export const dynamic = 'force-dynamic';

/**
 * Read-only on purpose. These are enquiries from the website contact form, and
 * the reply happens in your email client where you already keep your threads —
 * duplicating that here would only split the conversation in two.
 */
export default async function MessagesPage() {
  const messages = await listContactMessages(100);

  const fmt = (ms: number) => new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <>
      <div className="phead">
        <div>
          <h1>Messages</h1>
          <p>Everything sent through the contact form on your website.</p>
        </div>
        <span className={`chip ${messages.length ? 'c-info' : 'c-mute'}`}>
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="note">
        <b>Reply from your inbox.</b> Hitting reply opens your normal email program with the
        address filled in, so the thread lives where the rest of your correspondence does.
        Most enquiries that turn into work get answered the same day.
      </div>

      {messages.length === 0 ? (
        <div className="empty">
          <h3>No messages yet</h3>
          <p>
            When somebody fills in the contact form on your website, it lands here and you get
            a notification on the dashboard.
          </p>
        </div>
      ) : (
        <div className="acard">
          <div className="ch"><h3>Contact form enquiries</h3></div>
          <div className="cb flush">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Message</th>
                  <th>Received</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td style={{ minWidth: 190, verticalAlign: 'top' }}>
                      <b style={{ color: 'var(--navy)', display: 'block' }}>{m.name || 'No name given'}</b>
                      {m.email && (
                        <span style={{ fontSize: '.8rem', color: 'var(--slate)', display: 'block' }}>
                          {m.email}
                        </span>
                      )}
                      {m.phone && (
                        <a href={`tel:${m.phone}`} style={{ fontSize: '.8rem' }}>{m.phone}</a>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, verticalAlign: 'top' }}>
                      {m.message || <span className="hint">No message text.</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--slate)', verticalAlign: 'top' }}>
                      {fmt(m.createdAt)}
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      {m.email ? (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your enquiry to SUNN Clean')}`}
                        >
                          Reply
                        </a>
                      ) : (
                        <span className="chip c-mute">No email</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
