import { useState, type FormEvent } from 'react';

import { cleanCode, normalizePhone } from '../lib/format';
import { supabase } from '../supabase';
import { Icon } from '../ui/Icon';
import { Notice } from '../ui/kit';

function authWords(error: { code?: string | undefined; status?: number | undefined; name?: string | undefined }, step: 'send' | 'verify'): string {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return "You're offline. Connect and try again.";
  switch (error.code) {
    case 'otp_expired':
    case 'invalid_credentials':
      return "That code didn't work. It may have expired. Check it, or send a new one.";
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many codes asked for in a short time. Wait a minute, then send a new one.';
    case 'signup_disabled':
    case 'otp_disabled':
      return 'Only existing Ojoro staff accounts can sign in here.';
    default:
      return step === 'send' ? "We couldn't send a code. Try again in a minute." : "We couldn't check that code. Try again.";
  }
}

/** Phone and code, then the server decides if this account is staff (App checks my_staff_role). */
export function SignIn({ refusal, onClearRefusal }: { refusal: string | null; onClearRefusal: () => void }) {
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    onClearRefusal();
    const n = normalizePhone(phone);
    if (!n.ok) return setError(n.error);
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // shouldCreateUser: false — the admin tool never creates accounts.
    const { error: failed } = await supabase.auth.signInWithOtp({ phone: n.e164, options: { shouldCreateUser: false } });
    setBusy(false);
    if (failed) return setError(authWords(failed, 'send'));
    setE164(n.e164);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !e164) return;
    if (code.length !== 6) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    setBusy(false);
    if (failed) setError(authWords(failed, 'verify'));
  }

  return (
    <main className="signin" id="main">
      <p className="label muted">Ojoro staff</p>
      <h1 className="display display-sm">Sign in</h1>
      <p className="body-sm muted">For Ojoro staff only. Every action you take here is recorded in the audit log.</p>
      {refusal ? (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Notice kind="error" title={refusal}>
            Ask an Ojoro admin if you should have access.
          </Notice>
        </div>
      ) : null}
      {e164 === null ? (
        <form onSubmit={send} noValidate>
          <div className="field">
            <label className="label" htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'signin-error' : undefined}
            />
          </div>
          {error ? <FieldError id="signin-error" text={error} /> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Sending' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <p className="body-sm">
            We sent a code to <span className="num">{e164}</span>.
          </p>
          <div className="field">
            <label className="label" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              className="input num"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'signin-error' : undefined}
              autoFocus
            />
          </div>
          {error ? <FieldError id="signin-error" text={error} /> : null}
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Checking' : 'Sign in'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setE164(null);
                setCode('');
                setError(null);
              }}
            >
              Use another number
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

export function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p className="field-error body-sm" id={id} role="alert">
      <Icon name="alert" size={18} />
      {text}
    </p>
  );
}
