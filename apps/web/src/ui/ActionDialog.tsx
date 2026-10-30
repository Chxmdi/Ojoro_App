import { useState, type FormEvent, type ReactNode } from 'react';

import { errorWords } from '../lib/errors';
import { fromLocalInput, localInputValue } from '../lib/format';
import { NOTE_MAX, REASON_MAX, REPORT_REASONS, reasonWord, validateNote, validatePauseEnd, validateReason } from '../lib/moderation';
import { FieldError } from '../screens/SignIn';
import { Modal } from './kit';

export type ActionValues = { reason: string; note: string | null; endsAt: string | null; reasonCode: string; effect: string | null };

export type ActionSpec = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Final actions say so next to the button. */
  final?: boolean;
  note?: { label: string; hint: string };
  pause?: { defaultReasonCode: string };
  effect?: { label: string; options: { value: string; label: string }[] };
  run: (values: ActionValues) => Promise<void>;
};

/**
 * Confirmation for a staff write. The safe option (Cancel) is focused first; a reason is always
 * written down (it goes in the audit log). The caller keeps one idempotency key per opened dialog,
 * so a retry after a dropped connection is the same intention.
 */
export function ActionDialog({ spec, onClose, online }: { spec: ActionSpec | null; onClose: () => void; online: boolean }) {
  return (
    <Modal open={spec !== null} title={spec?.title ?? ''} onClose={onClose}>
      {spec ? <ActionForm key={spec.title} spec={spec} onClose={onClose} online={online} /> : null}
    </Modal>
  );
}

const DAY = 86_400_000;

function ActionForm({ spec, onClose, online }: { spec: ActionSpec; onClose: () => void; online: boolean }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [reasonCode, setReasonCode] = useState(spec.pause?.defaultReasonCode ?? 'other');
  const [until, setUntil] = useState<'restored' | 'date'>('date');
  const [endsLocal, setEndsLocal] = useState(() => localInputValue(new Date(Date.now() + 7 * DAY)));
  const [effect, setEffect] = useState(spec.effect?.options[0]?.value ?? '');
  const [errors, setErrors] = useState<{ reason?: string; note?: string; ends?: string; submit?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const endsAt = spec.pause && until === 'date' ? fromLocalInput(endsLocal) : null;
    const next = {
      ...(validateReason(reason) ? { reason: validateReason(reason)! } : {}),
      ...(spec.note && validateNote(note) ? { note: validateNote(note)! } : {}),
      ...(spec.pause && until === 'date' ? (validatePauseEnd(endsAt ?? 'invalid') ? { ends: validatePauseEnd(endsAt ?? 'invalid')! } : {}) : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await spec.run({ reason: reason.trim(), note: note.trim() || null, endsAt, reasonCode, effect: spec.effect ? effect : null });
      onClose();
    } catch (thrown) {
      setErrors({ submit: errorWords(thrown) });
    } finally {
      setBusy(false);
    }
  }

  const quick = (days: number) => setEndsLocal(localInputValue(new Date(Date.now() + days * DAY)));

  return (
    <form onSubmit={submit} noValidate className="stack">
      <div className="body-sm">{spec.body}</div>

      {spec.pause ? (
        <>
          <div className="field">
            <label className="label-sm" htmlFor="a-code">
              Reason category
            </label>
            <select id="a-code" className="select" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {reasonWord(r)}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label-sm">How long</legend>
            <label className="row body-sm">
              <input type="radio" name="until" checked={until === 'date'} onChange={() => setUntil('date')} /> Until a date
            </label>
            {until === 'date' ? (
              <>
                <input
                  className="input num"
                  type="datetime-local"
                  aria-label="Pause ends"
                  value={endsLocal}
                  onChange={(e) => setEndsLocal(e.target.value)}
                  aria-invalid={errors.ends ? true : undefined}
                  aria-describedby={errors.ends ? 'a-ends-err' : undefined}
                />
                <div className="row">
                  {[1, 7, 30].map((d) => (
                    <button key={d} type="button" className="btn btn-small" onClick={() => quick(d)}>
                      {d === 1 ? '1 day' : `${d} days`}
                    </button>
                  ))}
                </div>
                {errors.ends ? <FieldError id="a-ends-err" text={errors.ends} /> : null}
              </>
            ) : null}
            <label className="row body-sm">
              <input type="radio" name="until" checked={until === 'restored'} onChange={() => setUntil('restored')} /> Until staff restore it
            </label>
          </fieldset>
        </>
      ) : null}

      {spec.effect ? (
        <div className="field">
          <label className="label-sm" htmlFor="a-effect">
            {spec.effect.label}
          </label>
          <select id="a-effect" className="select" value={effect} onChange={(e) => setEffect(e.target.value)}>
            {spec.effect.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label className="label-sm" htmlFor="a-reason">
          Reason (staff only, in the audit log)
        </label>
        <textarea
          id="a-reason"
          className="textarea"
          value={reason}
          maxLength={REASON_MAX + 50}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? 'a-reason-err' : 'a-reason-count'}
        />
        <span id="a-reason-count" className="caption muted num">
          {reason.trim().length} / {REASON_MAX}
        </span>
        {errors.reason ? <FieldError id="a-reason-err" text={errors.reason} /> : null}
      </div>

      {spec.note ? (
        <div className="field">
          <label className="label-sm" htmlFor="a-note">
            {spec.note.label}
          </label>
          <textarea
            id="a-note"
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? 'a-note-err' : 'a-note-hint'}
          />
          <span id="a-note-hint" className="caption muted">
            {spec.note.hint} {note.trim().length} / {NOTE_MAX}
          </span>
          {errors.note ? <FieldError id="a-note-err" text={errors.note} /> : null}
        </div>
      ) : null}

      {errors.submit ? <FieldError id="a-submit-err" text={errors.submit} /> : null}
      {!online ? <FieldError id="a-offline" text="You're offline. Connect to do this." /> : null}

      <div className="actions">
        {spec.final ? <span className="caption muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>This can't be undone.</span> : null}
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !online}>
          {busy ? 'Working' : spec.confirmLabel}
        </button>
      </div>
    </form>
  );
}
