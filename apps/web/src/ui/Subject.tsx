import { useEffect, useState } from 'react';

import { api } from '../api';
import { dateTime } from '../lib/format';
import { kindWord } from '../lib/moderation';
import type { StaffSubject } from '../lib/types';
import { Tag } from './kit';

/**
 * Reported content, shown safely: text as React text (never HTML), photos blurred until a staff
 * member chooses to look, people by name and handle, places by name and area only.
 */
export function SubjectView({ subject, heading }: { subject: StaffSubject; heading: string }) {
  return (
    <section className="subject" aria-label={heading}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="label-sm muted">{heading}</p>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          {!subject.exists ? <Tag tone="quiet">Gone</Tag> : null}
          {subject.deleted ? <Tag tone="quiet">Deleted by author</Tag> : null}
          {subject.hidden ? <Tag tone="strong">Hidden by staff</Tag> : null}
        </span>
      </div>
      <p className="title-sm" style={{ marginTop: 'var(--space-2)' }}>
        {subject.title ?? kindWord(subject.kind)}
      </p>
      <p className="caption muted">
        {subject.author ? (
          <>
            By {subject.author.display_name ?? 'No name'}
            {subject.author.handle ? ` (@${subject.author.handle})` : ''}
          </>
        ) : (
          'No author'
        )}
        {subject.context?.label && subject.context.label !== subject.title
          ? ` · ${subject.context.label}`
          : ''}
        {subject.created_at ? ` · ${dateTime(subject.created_at)}` : ''}
      </p>
      {subject.text ? <blockquote className="body-sm">{subject.text}</blockquote> : null}
      {subject.media?.map((m) => (
        <BlurredPhoto
          key={`${m.bucket}/${m.path}`}
          bucket={m.bucket}
          path={m.path}
          alt={m.alt_text}
        />
      ))}
      {!subject.text && !subject.media?.length ? (
        <p className="body-sm muted">No text or photo.</p>
      ) : null}
    </section>
  );
}

function BlurredPhoto({ bucket, path, alt }: { bucket: string; path: string; alt: string | null }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    api.photoUrl(bucket, path).then(
      (u) => live && setUrl(u),
      () => live && setUrl(null),
    );
    return () => {
      live = false;
    };
  }, [bucket, path]);
  return (
    <figure style={{ margin: 'var(--space-4) 0 0' }}>
      <div
        style={{
          position: 'relative',
          maxWidth: 360,
          background: 'var(--surface-sunk)',
          minHeight: 120,
        }}
      >
        {url ? (
          <img
            src={url}
            alt={shown ? (alt ?? 'Reported photo') : 'Reported photo, blurred'}
            referrerPolicy="no-referrer"
            style={{ display: 'block', width: '100%', filter: shown ? 'none' : 'blur(24px)' }}
          />
        ) : (
          <p className="body-sm muted" style={{ padding: 'var(--space-4)', margin: 0 }}>
            {url === null ? "The photo couldn't be loaded." : 'Loading photo'}
          </p>
        )}
      </div>
      <figcaption className="row" style={{ marginTop: 'var(--space-2)' }}>
        {url ? (
          <button
            type="button"
            className="btn btn-small"
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? 'Blur photo' : 'Show photo'}
          </button>
        ) : null}
        <span className="mono muted">
          {bucket}/{path}
        </span>
      </figcaption>
    </figure>
  );
}
