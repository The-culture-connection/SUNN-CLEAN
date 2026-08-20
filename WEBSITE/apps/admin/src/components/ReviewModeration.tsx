'use client';

import { useState } from 'react';
// Type-only: a runtime import from the shared package would pull firebase-admin
// into the browser bundle. The server page does the formatting and signing.
import type { Review } from '@sunnclean/shared';
import { Err, useAction } from '@/components/ui';

export interface ReviewCard {
  review: Review;
  /** Short-lived signed URLs generated on the server. */
  photoUrls: string[];
  /** Formatted on the server so the markup matches after hydration. */
  submittedLabel: string;
  respondedLabel: string;
  /** How many reviews share this ipHash, this one included. */
  sameIpCount: number;
}

export interface ReviewModerationProps {
  pending: ReviewCard[];
  approved: ReviewCard[];
  rejected: ReviewCard[];
}

type SectionKey = 'pending' | 'approved' | 'rejected';
type ActionKey = 'approve' | 'approve_feature' | 'reject' | 'reply';

function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="stars" aria-label={`${n} out of 5 stars`}>
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  );
}

const photoStyle: React.CSSProperties = {
  width: 116,
  height: 88,
  objectFit: 'cover',
  borderRadius: 8,
  background: 'var(--bg)',
};

const metaLabel: React.CSSProperties = { marginBottom: 2 };

interface CardProps {
  c: ReviewCard;
  section: SectionKey;
  busy: boolean;
  reason: string;
  reply: string;
  replyOpen: boolean;
  onReason: (id: string, value: string) => void;
  onReply: (id: string, value: string) => void;
  onToggleReply: (id: string) => void;
  onAct: (id: string, action: ActionKey) => void;
  onDelete: (c: ReviewCard) => void;
}

/**
 * Defined at module scope, not inside ReviewModeration. A component declared
 * inside another component gets a fresh identity on every render, which
 * remounts the subtree and throws away focus mid-keystroke in the reason and
 * reply boxes.
 */
function Card({
  c, section, busy, reason, reply, replyOpen,
  onReason, onReply, onToggleReply, onAct, onDelete,
}: CardProps) {
  const r = c.review;
  return (
    <div className="modcard" style={{ marginBottom: 16 }}>
      <div className="setrow" style={{ paddingTop: 0 }}>
        <div className="sl" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Stars rating={r.rating} />
          <span className={`badge ${r.verified ? 'ver' : 'unver'}`}>
            {r.verified ? '✓ Verified customer' : 'Unverified'}
          </span>
          {r.featured && <span className="chip c-info">Featured</span>}
          {section === 'rejected' && <span className="chip c-bad">Rejected</span>}
        </div>
        <span className="hint" style={{ margin: 0 }}>{c.submittedLabel}</span>
      </div>

      <div style={{ padding: '12px 0' }}>
        {r.title && (
          <b style={{ display: 'block', color: 'var(--navy)', fontSize: '.98rem', marginBottom: 5 }}>
            {r.title}
          </b>
        )}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{r.body}</p>
      </div>

      {c.photoUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {c.photoUrls.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Review photo ${i + 1}`} style={photoStyle} />
            </a>
          ))}
        </div>
      )}

      <div className="f3" style={{ fontSize: '.83rem', color: 'var(--slate)', marginBottom: 10 }}>
        <div>
          <span className="flabel" style={metaLabel}>Shown as</span>
          {r.displayName || '—'}
        </div>
        <div>
          <span className="flabel" style={metaLabel}>Business type</span>
          {r.businessTypeLabel || '—'}
        </div>
        <div>
          <span className="flabel" style={metaLabel}>Service</span>
          {r.serviceName || '—'}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Submitter fingerprint <code>{r.ipHash ? r.ipHash.slice(0, 16) : 'none recorded'}</code>
        {c.sameIpCount > 1 && (
          <>
            {' · '}
            <b style={{ color: 'var(--warn)' }}>
              {c.sameIpCount} reviews from this same fingerprint
            </b>
            {' — worth a closer look before you publish them all.'}
          </>
        )}
      </p>

      {r.ownerResponse?.body && !replyOpen && (
        <div className="note" style={{ marginTop: 0 }}>
          <b>Your reply{c.respondedLabel ? ` · ${c.respondedLabel}` : ''}</b>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.ownerResponse.body}</p>
        </div>
      )}

      {section === 'rejected' && r.moderation?.reason && (
        <div className="warn" style={{ marginTop: 0 }}>
          <b>Reason recorded:</b> {r.moderation.reason}
        </div>
      )}

      {section !== 'rejected' && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor={`why-${r.id}`}>Reason (needed to reject)</label>
          <input id={`why-${r.id}`} maxLength={1000} value={reason}
            placeholder="Spam, not a real customer, abusive language…"
            onChange={(e) => onReason(r.id, e.target.value)} />
        </div>
      )}

      {replyOpen && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor={`reply-${r.id}`}>Your public reply</label>
          <textarea id={`reply-${r.id}`} rows={4} maxLength={4000} value={reply}
            placeholder="Thank them by name, answer the specific thing they raised, say what you changed."
            onChange={(e) => onReply(r.id, e.target.value)} />
          <p className="hint">
            This appears under the review on your website. Short and specific beats long
            and defensive.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {section !== 'approved' && (
          <button type="button" className="btn btn-primary btn-sm"
            onClick={() => onAct(r.id, 'approve')} disabled={busy}>
            Approve
          </button>
        )}
        {section !== 'approved' && (
          <button type="button" className="btn btn-navy btn-sm"
            onClick={() => onAct(r.id, 'approve_feature')} disabled={busy}>
            Approve &amp; feature
          </button>
        )}
        {section === 'approved' && !r.featured && (
          <button type="button" className="btn btn-navy btn-sm"
            onClick={() => onAct(r.id, 'approve_feature')} disabled={busy}>
            Feature this one
          </button>
        )}
        {section === 'approved' && r.featured && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => onAct(r.id, 'approve')} disabled={busy}>
            Stop featuring
          </button>
        )}
        {section !== 'rejected' && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => onAct(r.id, 'reject')} disabled={busy}>
            Reject
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => onToggleReply(r.id)} disabled={busy}>
          {replyOpen ? 'Save reply' : r.ownerResponse?.body ? 'Edit reply' : 'Reply'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => onDelete(c)} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function ReviewModeration({ pending, approved, rejected }: ReviewModerationProps) {
  const { run, pending: busy, error } = useAction();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [openReply, setOpenReply] = useState<Record<string, boolean>>({});

  async function act(id: string, action: ActionKey) {
    await run('/api/reviews', {
      id,
      action,
      reason: reasons[id] ?? '',
      response: replies[id] ?? '',
    });
  }

  function toggleReply(c: ReviewCard) {
    const id = c.review.id;
    if (openReply[id]) {
      void act(id, 'reply');
      setOpenReply((m) => ({ ...m, [id]: false }));
      return;
    }
    // Seed the box with whatever is already published so an edit is an edit.
    setReplies((m) => ({ ...m, [id]: m[id] ?? c.review.ownerResponse?.body ?? '' }));
    setOpenReply((m) => ({ ...m, [id]: true }));
  }

  async function remove(c: ReviewCard) {
    const ok = window.confirm(
      `Delete this ${c.review.rating}-star review from ${c.review.displayName || 'a customer'}? `
      + 'It goes for good, along with its photos. Rejecting keeps a record of why; deleting does not.',
    );
    if (!ok) return;
    await run('/api/reviews', { id: c.review.id }, 'DELETE');
  }

  const sections: { key: SectionKey; title: string; blurb: string; cards: ReviewCard[] }[] = [
    {
      key: 'pending',
      title: 'Waiting for you',
      blurb: 'Read it, then approve or reject. Rejections need a reason so you have a record.',
      cards: pending,
    },
    {
      key: 'approved',
      title: 'Published',
      blurb: 'Live on your website. You can still add or change your reply.',
      cards: approved,
    },
    {
      key: 'rejected',
      title: 'Rejected',
      blurb: 'Kept for your records with the reason. Their photos were deleted.',
      cards: rejected,
    },
  ];

  return (
    <>
      <div className="phead">
        <div>
          <h1>Reviews</h1>
          <p>Nothing reaches your website until you have read it and said yes.</p>
        </div>
        {pending.length > 0 && (
          <span className="chip c-warn">{pending.length} waiting on you</span>
        )}
      </div>

      <div className="note">
        <b>How to judge these.</b> Publish honest criticism and reject spam — that is the whole
        rule. A thoughtful 3-star review with a calm reply underneath it builds far more trust
        than a wall of 5s, because a wall of 5s reads as fake to anyone who has shopped online.
        Approving a review also moves its photos out of quarantine and onto the public site.
      </div>

      <Err>{error}</Err>

      {sections.map((s) => (
        <div key={s.key} className="acard" style={{ marginBottom: 20 }}>
          <div className="ch">
            <div>
              <h3>{s.title}</h3>
              <p className="hint" style={{ marginTop: 2 }}>{s.blurb}</p>
            </div>
            <span className={`chip ${s.key === 'pending' && s.cards.length ? 'c-warn' : 'c-mute'}`}>
              {s.cards.length}
            </span>
          </div>
          <div className="cb">
            {s.cards.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Nothing here right now.</p>
            ) : s.cards.map((c) => (
              <Card
                key={c.review.id}
                c={c}
                section={s.key}
                busy={busy}
                reason={reasons[c.review.id] ?? ''}
                reply={replies[c.review.id] ?? ''}
                replyOpen={openReply[c.review.id] ?? false}
                onReason={(id, value) => setReasons((m) => ({ ...m, [id]: value }))}
                onReply={(id, value) => setReplies((m) => ({ ...m, [id]: value }))}
                onToggleReply={() => toggleReply(c)}
                onAct={act}
                onDelete={remove}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
