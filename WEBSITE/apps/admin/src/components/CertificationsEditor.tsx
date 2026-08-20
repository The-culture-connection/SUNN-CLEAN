'use client';

import { useEffect, useState } from 'react';
// Type-only: a runtime import from the shared package would pull firebase-admin
// into the browser bundle. The server page passes the labels and dates in.
import type { CertCategory, Certification } from '@sunnclean/shared';
import { Err, Toggle, useAction } from '@/components/ui';

export interface CertRow {
  cert: Certification;
  /** Short-lived signed URLs generated on the server. Empty when unavailable. */
  badgeUrl: string;
  documentUrl: string;
}

export interface CertificationsEditorProps {
  rows: CertRow[];
  categories: { value: CertCategory; label: string }[];
  /** Business-local "today" and today + 60 days, both yyyy-mm-dd. */
  today: string;
  soonCutoff: string;
  nextOrder: number;
}

interface Draft {
  id: string;
  name: string;
  issuer: string;
  category: CertCategory;
  credentialId: string;
  description: string;
  issueDate: string;
  expiryDate: string;
  badgeImagePath: string;
  documentPath: string;
  published: boolean;
  order: string;
}

function toDraft(r: CertRow): Draft {
  return {
    id: r.cert.id,
    name: r.cert.name ?? '',
    issuer: r.cert.issuer ?? '',
    category: r.cert.category ?? 'insurance',
    credentialId: r.cert.credentialId ?? '',
    description: r.cert.description ?? '',
    issueDate: r.cert.issueDate ?? '',
    expiryDate: r.cert.expiryDate ?? '',
    badgeImagePath: r.cert.badgeImagePath ?? '',
    documentPath: r.cert.documentPath ?? '',
    published: r.cert.published ?? false,
    order: String(r.cert.order ?? 0),
  };
}

/** Badges keep their transparency, so they go out as PNG. */
async function compressBadge(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not process that image.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

/** PDFs go up as-is — re-encoding a certificate would defeat the point. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function CertificationsEditor({
  rows, categories, today, soonCutoff, nextOrder,
}: CertificationsEditorProps) {
  const { run, pending, error, setError } = useAction();
  const [drafts, setDrafts] = useState<Draft[]>(() => rows.map(toDraft));
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState('');
  const [fileError, setFileError] = useState('');

  useEffect(() => { setDrafts(rows.map(toDraft)); }, [rows]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
    setSaved('');
  }

  async function post(url: string, payload: unknown): Promise<{ id?: string; path?: string } | null> {
    return (await run(url, payload)) as { id?: string; path?: string } | null;
  }

  function payloadFor(d: Draft) {
    return {
      id: d.id,
      name: d.name,
      issuer: d.issuer,
      category: d.category,
      credentialId: d.credentialId,
      description: d.description,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      badgeImagePath: d.badgeImagePath,
      documentPath: d.documentPath,
      published: d.published,
      order: d.order,
    };
  }

  async function save(d: Draft) {
    const res = await run('/api/certifications', payloadFor(d));
    if (res) setSaved(d.id);
  }

  async function add() {
    setError('');
    await run('/api/certifications', {
      name: 'New certification',
      issuer: '',
      category: 'insurance',
      credentialId: '',
      description: '',
      issueDate: '',
      expiryDate: '',
      badgeImagePath: '',
      documentPath: '',
      published: false,
      order: nextOrder,
    });
  }

  async function remove(d: Draft) {
    const ok = window.confirm(
      `Delete "${d.name || 'this certification'}"? The badge and document go with it.`,
    );
    if (!ok) return;
    await run('/api/certifications', { id: d.id }, 'DELETE');
  }

  async function uploadBadge(d: Draft, file: File) {
    setFileError('');
    setBusy(d.id);
    try {
      const dataUrl = await compressBadge(file);
      const up = await post('/api/upload', {
        dataUrl, path: `public/certifications/${d.id}/badge.png`, contentType: 'image/png',
      });
      if (!up?.path) return;
      await run('/api/certifications', { ...payloadFor(d), badgeImagePath: up.path });
    } catch {
      setFileError('That badge image could not be prepared. Try a PNG or JPEG.');
    } finally {
      setBusy('');
    }
  }

  async function uploadDocument(d: Draft, file: File) {
    setFileError('');
    if (file.type !== 'application/pdf') {
      setFileError('The document needs to be a PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setFileError(`That PDF is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 8 MB.`);
      return;
    }
    setBusy(d.id);
    try {
      const dataUrl = await readAsDataUrl(file);
      const up = await post('/api/upload', {
        dataUrl, path: `public/certifications/${d.id}/document.pdf`, contentType: 'application/pdf',
      });
      if (!up?.path) return;
      await run('/api/certifications', { ...payloadFor(d), documentPath: up.path });
    } catch {
      setFileError('That PDF could not be read. Try re-saving it and uploading again.');
    } finally {
      setBusy('');
    }
  }

  /** Comparing yyyy-mm-dd strings works because both dates are fixed-width. */
  function status(expiry: string): { cls: string; text: string } | null {
    if (!expiry) return null;
    if (expiry < today) return { cls: 'c-bad', text: `Expired ${expiry}` };
    if (expiry <= soonCutoff) return { cls: 'c-warn', text: `Expires ${expiry}` };
    return { cls: 'c-good', text: `Valid to ${expiry}` };
  }

  const expired = drafts.filter((d) => d.expiryDate && d.expiryDate < today);
  const expiring = drafts.filter(
    (d) => d.expiryDate && d.expiryDate >= today && d.expiryDate <= soonCutoff,
  );

  return (
    <>
      <div className="phead">
        <div>
          <h1>Certifications</h1>
          <p>Insurance, bonding and training — the paperwork that wins the bigger contracts.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={add} disabled={pending}>
          + Add certification
        </button>
      </div>

      <div className="note">
        <b>Expired credentials hide themselves.</b> Once a certification passes its expiry date
        it drops off the public website automatically, even if it is still switched on here.
        That is deliberate — an out-of-date insurance badge on a website is worse than no badge
        at all. Renew it, update the expiry date, and it reappears.
      </div>

      {expired.length > 0 && (
        <div className="err" role="alert">
          <b>{expired.length} certification{expired.length === 1 ? ' has' : 's have'} expired</b>
          {' — '}
          {expired.map((d) => d.name || 'Untitled').join(', ')}. These are already hidden from
          the website. Renew and update the dates.
        </div>
      )}
      {expiring.length > 0 && (
        <div className="warn">
          <b>Renewal coming up.</b> {expiring.map((d) => `${d.name || 'Untitled'} (${d.expiryDate})`).join(', ')}
          {' '}expire{expiring.length === 1 ? 's' : ''} within the next 60 days. Renewals often
          take a few weeks, so it is worth starting now.
        </div>
      )}

      <Err>{error}</Err>
      {fileError && <div className="err" role="alert">{fileError}</div>}

      {drafts.length === 0 ? (
        <div className="empty">
          <h3>No certifications listed yet</h3>
          <p>
            Start with your general liability insurance and your bonding. Those two answer the
            question every property manager asks first.
          </p>
        </div>
      ) : (
        <div className="grid g2">
          {drafts.map((d) => {
            const row = rows.find((r) => r.cert.id === d.id);
            const chip = status(d.expiryDate);
            const working = busy === d.id;
            return (
              <div key={d.id} className="acard">
                <div className="ch">
                  <h3 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name || 'Untitled certification'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`chip ${d.published ? 'c-good' : 'c-mute'}`}>
                      {d.published ? 'Shown' : 'Hidden'}
                    </span>
                    <Toggle on={d.published} label={`Publish ${d.name || 'this certification'}`}
                      onChange={(v) => patch(d.id, { published: v })} />
                  </div>
                </div>
                <div className="cb">
                  {chip && (
                    <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`chip ${chip.cls}`}>{chip.text}</span>
                      {chip.cls === 'c-bad' && (
                        <span className="hint" style={{ margin: 0 }}>
                          Automatically hidden from the public site.
                        </span>
                      )}
                      {chip.cls === 'c-warn' && (
                        <span className="hint" style={{ margin: 0 }}>
                          Renew within 60 days or it disappears from the site.
                        </span>
                      )}
                    </div>
                  )}

                  <div className="f2">
                    <div className="field">
                      <label htmlFor={`n-${d.id}`}>Name</label>
                      <input id={`n-${d.id}`} maxLength={140} value={d.name}
                        onChange={(e) => patch(d.id, { name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`i-${d.id}`}>Issued by</label>
                      <input id={`i-${d.id}`} maxLength={140} value={d.issuer}
                        placeholder="State of New York, ISSA, OSHA…"
                        onChange={(e) => patch(d.id, { issuer: e.target.value })} />
                    </div>
                  </div>

                  <div className="f2">
                    <div className="field">
                      <label htmlFor={`c-${d.id}`}>Category</label>
                      <select id={`c-${d.id}`} value={d.category}
                        onChange={(e) => patch(d.id, { category: e.target.value as CertCategory })}>
                        {categories.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`cid-${d.id}`}>Credential or policy number</label>
                      <input id={`cid-${d.id}`} maxLength={140} value={d.credentialId}
                        onChange={(e) => patch(d.id, { credentialId: e.target.value })} />
                    </div>
                  </div>

                  <div className="f3">
                    <div className="field">
                      <label htmlFor={`id-${d.id}`}>Issued</label>
                      <input id={`id-${d.id}`} type="date" value={d.issueDate}
                        onChange={(e) => patch(d.id, { issueDate: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`ed-${d.id}`}>Expires</label>
                      <input id={`ed-${d.id}`} type="date" value={d.expiryDate}
                        onChange={(e) => patch(d.id, { expiryDate: e.target.value })} />
                      <p className="hint">Leave blank if it does not expire.</p>
                    </div>
                    <div className="field">
                      <label htmlFor={`o-${d.id}`}>Order</label>
                      <input id={`o-${d.id}`} type="number" min={0} step={1} value={d.order}
                        onChange={(e) => patch(d.id, { order: e.target.value })} />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor={`d-${d.id}`}>What this covers</label>
                    <textarea id={`d-${d.id}`} rows={3} maxLength={2000} value={d.description}
                      placeholder="One or two plain sentences a property manager would understand."
                      onChange={(e) => patch(d.id, { description: e.target.value })} />
                  </div>

                  <div className="f2">
                    <div className="field">
                      <label htmlFor={`b-${d.id}`}>Badge image (optional)</label>
                      {row?.badgeUrl && (
                        <img src={row.badgeUrl} alt={`${d.name} badge`}
                          style={{ height: 56, width: 'auto', display: 'block', marginBottom: 8 }} />
                      )}
                      <input id={`b-${d.id}`} type="file" accept="image/jpeg,image/png,image/webp"
                        disabled={working || pending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void uploadBadge(d, file);
                        }} />
                      <p className="hint">
                        {d.badgeImagePath ? 'Uploading a new one replaces it.' : 'A logo or seal, if the issuer gives you one.'}
                      </p>
                    </div>
                    <div className="field">
                      <label htmlFor={`doc-${d.id}`}>Certificate PDF (optional)</label>
                      {row?.documentUrl && (
                        <p style={{ marginBottom: 8 }}>
                          <a href={row.documentUrl} target="_blank" rel="noreferrer">
                            View the PDF on file
                          </a>
                        </p>
                      )}
                      <input id={`doc-${d.id}`} type="file" accept="application/pdf"
                        disabled={working || pending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void uploadDocument(d, file);
                        }} />
                      <p className="hint">Handy when a client asks for the actual certificate.</p>
                    </div>
                  </div>

                  <div className="setrow">
                    <div className="sl">
                      {working && <span className="chip c-info">Uploading…</span>}
                      {!working && saved === d.id && <span className="chip c-good">Saved</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => remove(d)} disabled={pending || working}>
                        Delete
                      </button>
                      <button type="button" className="btn btn-navy btn-sm"
                        onClick={() => save(d)} disabled={pending || working}>
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
