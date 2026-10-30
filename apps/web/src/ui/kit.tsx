import { useEffect, useRef, type ReactNode } from 'react';

import { ago } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { useDelayed } from './hooks';

export function Tag({
  children,
  icon,
  tone = 'plain',
}: {
  children: ReactNode;
  icon?: IconName;
  tone?: 'plain' | 'strong' | 'signal' | 'quiet';
}) {
  return (
    <span className={`tag${tone === 'plain' ? '' : ` tag-${tone}`}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

/** Three segments with gaps; the word beside it carries the meaning. */
export function Meter({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <span className="meter" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
  action,
}: {
  kind?: 'info' | 'error' | 'offline';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon: IconName = kind === 'error' ? 'alert' : kind === 'offline' ? 'offline' : 'clock';
  return (
    <div
      className={`notice${kind === 'error' ? ' notice-error' : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon name={icon} size={24} />
      <div className="notice-body">
        <p className="title-sm">{title}</p>
        {children ? <div className="body-sm">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** Rows shaped like the table that's coming, shown only after 300ms. */
export function Skeleton({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  const shown = useDelayed(true);
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {shown
        ? Array.from({ length: rows }, (_, i) => (
            <span key={i} className="skeleton" style={{ width: `${92 - (i % 3) * 14}%` }} />
          ))
        : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <p className="title">{title}</p>
      {children ? <p className="body-sm muted">{children}</p> : null}
    </div>
  );
}

/** Says the page is showing last-known data, and how old it is. */
export function StaleNote({
  online,
  loadedAt,
  failed,
}: {
  online: boolean;
  loadedAt: string | null;
  failed: boolean;
}) {
  if (online && !failed) return null;
  return (
    <Notice
      kind={online ? 'error' : 'offline'}
      title={online ? "Couldn't refresh." : "You're offline."}
    >
      Showing what loaded {ago(loadedAt)}. Actions are off until this refreshes.
    </Notice>
  );
}

export function Pager({
  page,
  hasNext,
  onPage,
  label,
}: {
  page: number;
  hasNext: boolean;
  onPage: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      <button
        type="button"
        className="btn btn-small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="back" size={16} /> Previous
      </button>
      <span className="label num" aria-live="polite">
        Page {page}
      </span>
      <button
        type="button"
        className="btn btn-small"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
      >
        Next <Icon name="forward" size={16} />
      </button>
    </nav>
  );
}

/** A native modal dialog: traps focus, closes on Escape, and focuses the safe option first. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <>
          <h2 id="modal-title" className="title">
            {title}
          </h2>
          {children}
        </>
      ) : null}
    </dialog>
  );
}

export function Toast({
  message,
  action,
  onDismiss,
}: {
  message: string;
  action?: { label: string; onPress: () => void };
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      {action ? (
        <button type="button" className="btn btn-small" onClick={action.onPress}>
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={onDismiss}
        aria-label="Close message"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
