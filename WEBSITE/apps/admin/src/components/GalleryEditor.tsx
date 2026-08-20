'use client';

import { useEffect, useRef, useState } from 'react';
// Type-only: importing a runtime value from the shared package would drag
// firebase-admin into the browser bundle. The server page passes values in.
import type { GalleryPair } from '@sunnclean/shared';
import { Err, Toggle, useAction } from '@/components/ui';

export interface GalleryRow {
  pair: GalleryPair;
  /** Short-lived signed URLs, generated on the server. Empty when unavailable. */
  beforeUrl: string;
  afterUrl: string;
}

export interface GalleryEditorProps {
  rows: GalleryRow[];
  services: { id: string; name: string }[];
  /** One past the highest order in use, so a new pair lands at the end. */
  nextOrder: number;
}

/** Numbers live in the draft as strings so a half-typed value survives. */
interface Draft {
  id: string;
  caption: string;
  serviceId: string;
  jobLengthLabel: string;
  order: string;
  published: boolean;
  featured: boolean;
  beforePath: string;
  afterPath: string;
}

function toDraft(r: GalleryRow): Draft {
  return {
    id: r.pair.id,
    caption: r.pair.caption ?? '',
    serviceId: r.pair.serviceId ?? '',
    jobLengthLabel: r.pair.jobLengthLabel ?? '',
    order: String(r.pair.order ?? 0),
    published: r.pair.published ?? false,
    featured: r.pair.featured ?? false,
    beforePath: r.pair.beforePath ?? '',
    afterPath: r.pair.afterPath ?? '',
  };
}

/**
 * Shrink in the browser so a phone photo uploads on a phone connection and
 * storage stays cheap. 2000px on the long edge is plenty for a web gallery.
 */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not process that photo.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const thumb: React.CSSProperties = {
  width: '100%',
  aspectRatio: '4 / 3',
  objectFit: 'cover',
  borderRadius: 8,
  background: 'var(--bg)',
  display: 'block',
};

const placeholder: React.CSSProperties = {
  ...thumb,
  display: 'grid',
  placeItems: 'center',
  border: '1.5px dashed var(--line)',
  color: 'var(--slate)',
  fontSize: '.78rem',
};

export function GalleryEditor({ rows, services, nextOrder }: GalleryEditorProps) {
  const { run, pending, error, setError } = useAction();
  const [drafts, setDrafts] = useState<Draft[]>(() => rows.map(toDraft));
  const [saved, setSaved] = useState('');

  // Upload form state
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [jobLengthLabel, setJobLengthLabel] = useState('');
  const [consent, setConsent] = useState(false);
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Re-sync once router.refresh() brings fresh rows down from the server.
  useEffect(() => { setDrafts(rows.map(toDraft)); }, [rows]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
    setSaved('');
  }

  /** `run` hands back the parsed body; this narrows it to what we read. */
  async function post(url: string, payload: unknown): Promise<{ id?: string; path?: string } | null> {
    return (await run(url, payload)) as { id?: string; path?: string } | null;
  }

  function resetForm() {
    setBeforeFile(null);
    setAfterFile(null);
    setCaption('');
    setJobLengthLabel('');
    setConsent(false);
    setPublished(true);
    if (beforeRef.current) beforeRef.current.value = '';
    if (afterRef.current) afterRef.current.value = '';
  }

  async function addPair() {
    setFormError('');
    setError('');
    if (!beforeFile || !afterFile) {
      setFormError('Pick both a before photo and an after photo — a pair needs the two of them.');
      return;
    }
    if (!caption.trim()) {
      setFormError('Add a short caption so visitors know what they are looking at.');
      return;
    }
    if (!consent) {
      setFormError("Tick the consent box. We do not publish a client's space without their permission.");
      return;
    }
    setBusy(true);
    try {
      const [beforeData, afterData] = await Promise.all([
        compressImage(beforeFile), compressImage(afterFile),
      ]);

      // The storage path contains the document id, so the document is created
      // first (unpublished), then the photos are attached to it.
      const base = {
        caption: caption.trim(),
        serviceId,
        jobLengthLabel: jobLengthLabel.trim(),
        consentConfirmed: true,
        featured: false,
        order: nextOrder,
      };
      const created = await post('/api/gallery', { ...base, published: false });
      const id = created?.id;
      if (!id) return;

      const before = await post('/api/upload', {
        dataUrl: beforeData, path: `public/gallery/${id}/before.jpg`, contentType: 'image/jpeg',
      });
      if (!before?.path) return;
      const after = await post('/api/upload', {
        dataUrl: afterData, path: `public/gallery/${id}/after.jpg`, contentType: 'image/jpeg',
      });
      if (!after?.path) return;

      const done = await post('/api/gallery', {
        ...base, id, published, beforePath: before.path, afterPath: after.path,
      });
      if (done) resetForm();
    } catch {
      setFormError('That photo could not be prepared for upload. Try a JPEG or PNG from your camera roll.');
    } finally {
      setBusy(false);
    }
  }

  async function save(d: Draft) {
    const res = await run('/api/gallery', {
      id: d.id,
      caption: d.caption,
      serviceId: d.serviceId,
      jobLengthLabel: d.jobLengthLabel,
      consentConfirmed: true,
      published: d.published,
      featured: d.featured,
      order: d.order,
      beforePath: d.beforePath,
      afterPath: d.afterPath,
    });
    if (res) setSaved(d.id);
  }

  async function remove(d: Draft) {
    const ok = window.confirm(
      `Delete "${d.caption || 'this pair'}"? The two photos are deleted from storage as well, so this is the right thing to do if a client withdraws permission.`,
    );
    if (!ok) return;
    await run('/api/gallery', { id: d.id }, 'DELETE');
  }

  const publishedCount = drafts.filter((d) => d.published).length;

  return (
    <>
      <div className="phead">
        <div>
          <h1>Before &amp; After</h1>
          <p>The proof-of-work photos visitors scroll through before they book.</p>
        </div>
        <span className={`chip ${publishedCount ? 'c-good' : 'c-mute'}`}>
          {publishedCount} live on the website
        </span>
      </div>

      <div className="note">
        <b>Where these end up.</b> Anything you publish here appears straight away on the
        public <b>/gallery</b> page of your website — no extra step. Only put a space up if
        the client said yes, and take it down the moment that permission runs out or they ask
        you to. Deleting a pair here removes the photos from storage too, not just the listing.
      </div>

      <Err>{error}</Err>

      <div className="acard" style={{ marginBottom: 20 }}>
        <div className="ch"><h3>Add a new pair</h3></div>
        <div className="cb">
          <div className="f2">
            <div className="field">
              <label htmlFor="g-before">Before photo</label>
              <input id="g-before" ref={beforeRef} type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)} />
              <p className="hint">
                {beforeFile ? beforeFile.name : 'The messy one. Shot from roughly the same spot as the after.'}
              </p>
            </div>
            <div className="field">
              <label htmlFor="g-after">After photo</label>
              <input id="g-after" ref={afterRef} type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)} />
              <p className="hint">
                {afterFile ? afterFile.name : 'Same angle, same lighting if you can manage it.'}
              </p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="g-caption">Caption</label>
            <input id="g-caption" maxLength={300} value={caption}
              placeholder="Post-construction clean, 12,000 sq ft office in Brooklyn"
              onChange={(e) => setCaption(e.target.value)} />
          </div>

          <div className="f3">
            <div className="field">
              <label htmlFor="g-service">Service</label>
              <select id="g-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Not tied to a service</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="g-length">How long the job took</label>
              <input id="g-length" maxLength={80} placeholder="One crew, two days"
                value={jobLengthLabel} onChange={(e) => setJobLengthLabel(e.target.value)} />
            </div>
            <div className="field">
              <span className="flabel">Publish now</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 4 }}>
                <Toggle on={published} label="Publish this pair on the website"
                  onChange={setPublished} />
                <span className={`chip ${published ? 'c-good' : 'c-mute'}`}>
                  {published ? 'Goes live' : 'Stays hidden'}
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="g-consent" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontWeight: 700 }}>
              <input id="g-consent" type="checkbox" checked={consent}
                style={{ width: 16, height: 16, padding: 0, marginTop: 2, flexShrink: 0 }}
                onChange={(e) => setConsent(e.target.checked)} />
              <span>I have the client&rsquo;s permission to publish photos of this space</span>
            </label>
            <p className="hint">
              Required. Your name goes on this record, so if anyone ever asks, you can show
              who confirmed it and when.
            </p>
          </div>

          {formError && <div className="err" role="alert">{formError}</div>}

          <button type="button" className="btn btn-primary" onClick={addPair}
            disabled={busy || pending}>
            {busy ? 'Uploading…' : 'Add pair'}
          </button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="empty">
          <h3>No before-and-afters yet</h3>
          <p>
            This is the single most persuasive thing on a cleaning website. Two photos from
            one job, taken from the same spot, do more than any paragraph of copy.
          </p>
        </div>
      ) : (
        <div className="grid g2">
          {drafts.map((d) => {
            const row = rows.find((r) => r.pair.id === d.id);
            return (
              <div key={d.id} className="acard">
                <div className="ch">
                  <h3 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.caption || 'Untitled pair'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`chip ${d.published ? 'c-good' : 'c-mute'}`}>
                      {d.published ? 'Live' : 'Hidden'}
                    </span>
                    <Toggle on={d.published} label={`Publish ${d.caption || 'this pair'}`}
                      onChange={(v) => patch(d.id, { published: v })} />
                  </div>
                </div>
                <div className="cb">
                  <div className="f2" style={{ marginBottom: 14 }}>
                    <div>
                      <span className="flabel">Before</span>
                      {row?.beforeUrl
                        ? <img src={row.beforeUrl} alt={`Before — ${d.caption}`} style={thumb} />
                        : <div style={placeholder}>No before photo</div>}
                    </div>
                    <div>
                      <span className="flabel">After</span>
                      {row?.afterUrl
                        ? <img src={row.afterUrl} alt={`After — ${d.caption}`} style={thumb} />
                        : <div style={placeholder}>No after photo</div>}
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor={`cap-${d.id}`}>Caption</label>
                    <input id={`cap-${d.id}`} maxLength={300} value={d.caption}
                      onChange={(e) => patch(d.id, { caption: e.target.value })} />
                  </div>

                  <div className="f3">
                    <div className="field">
                      <label htmlFor={`svc-${d.id}`}>Service</label>
                      <select id={`svc-${d.id}`} value={d.serviceId}
                        onChange={(e) => patch(d.id, { serviceId: e.target.value })}>
                        <option value="">Not tied to a service</option>
                        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`len-${d.id}`}>Job length</label>
                      <input id={`len-${d.id}`} maxLength={80} value={d.jobLengthLabel}
                        onChange={(e) => patch(d.id, { jobLengthLabel: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`ord-${d.id}`}>Order</label>
                      <input id={`ord-${d.id}`} type="number" min={0} step={1} value={d.order}
                        onChange={(e) => patch(d.id, { order: e.target.value })} />
                      <p className="hint">Lowest shows first.</p>
                    </div>
                  </div>

                  {!row?.beforeUrl || !row?.afterUrl ? (
                    <div className="warn">
                      One of these photos is missing, so this pair cannot go live. Delete it and
                      add the pair again.
                    </div>
                  ) : null}

                  <div className="setrow">
                    <div className="sl">
                      {saved === d.id
                        ? <span className="chip c-good">Saved</span>
                        : <span className="hint" style={{ margin: 0 }}>
                          Consent on file: {row?.pair.consentConfirmedBy || 'not recorded'}
                        </span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => remove(d)} disabled={pending || busy}>
                        Delete
                      </button>
                      <button type="button" className="btn btn-navy btn-sm"
                        onClick={() => save(d)} disabled={pending || busy}>
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
