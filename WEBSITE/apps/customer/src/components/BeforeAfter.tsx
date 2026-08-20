'use client';

import { useId, useState } from 'react';

/**
 * Before/after comparison slider.
 *
 * The draggable divider is a real <input type="range"> laid over the images at
 * zero opacity. That is deliberate: it gives keyboard operation, screen-reader
 * semantics and touch support for free, where a mousedown/mousemove handler
 * would give none of them.
 */
export function BeforeAfter({
  beforeUrl, afterUrl, caption, meta,
}: {
  beforeUrl: string; afterUrl: string; caption?: string; meta?: string;
}) {
  const [pos, setPos] = useState(50);
  const id = useId();
  if (!beforeUrl || !afterUrl) return null;

  return (
    <figure>
      <div className="ba" style={{ ['--sp' as string]: `${pos}%` }}>
        <img src={beforeUrl} alt={caption ? `Before: ${caption}` : 'Before cleaning'} loading="lazy" />
        <div className="afterWrap" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <img src={afterUrl} alt={caption ? `After: ${caption}` : 'After cleaning'} loading="lazy" />
        </div>
        <span className="tag l">Before</span>
        <span className="tag r">After</span>
        <div className="handle" style={{ left: `${pos}%` }} />
        <label htmlFor={id} className="sr-only" style={{ position: 'absolute', left: -9999 }}>
          {caption ? `Reveal the after photo for ${caption}` : 'Reveal the after photo'}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${pos}% revealed`}
        />
      </div>
      {(caption || meta) && (
        <figcaption className="bameta">
          <b>{caption}</b>
          <span>{meta}</span>
        </figcaption>
      )}
    </figure>
  );
}
