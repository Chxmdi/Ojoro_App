import {
  accountBlockerSentence,
  accountDeleteConfirmWord,
  accountDeleteFunction,
  accountDeletionGoes,
  accountDeletionStays,
  formerMemberName,
  isDeleteConfirmed,
  type AccountDeletionCheck,
  type Database,
} from '@ojoro/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useState, type FormEvent } from 'react';

import { deleteOutcome, maskE164, type DeleteOutcome } from '../lib/deleteAccount';
import { getAdminConfig } from '../lib/env';
import { errorWords } from '../lib/errors';
import { cleanCode, normalizePhone } from '../lib/format';
import { FieldError } from '../screens/SignIn';
import { Notice } from '../ui/kit';

const config = getAdminConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined,
});

/**
 * Its own client: publishable key, the session in memory only (never stored, never the staff tool's),
 * so closing the tab signs out. The deletion itself is the `account-delete` Edge Function.
 */
function makeClient(): SupabaseClient<Database> | null {
  if (!config.ok) return null;
  return createClient<Database>(config.config.url, config.config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'ojoro-delete-account',
    },
  });
}

function authWords(
  error: { code?: string | undefined; status?: number | undefined; name?: string | undefined },
  step: 'send' | 'verify',
): string {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0)
    return "You're offline. Connect and try again.";
  switch (error.code) {
    case 'otp_expired':
    case 'invalid_credentials':
      return "That code didn't work. It may have expired. Check it, or send a new one.";
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many codes asked for in a short time. Wait a minute, then send a new one.';
    case 'signup_disabled':
    case 'otp_disabled':
    case 'user_not_found':
      return "There's no Ojoro account with that number.";
    default:
      return step === 'send'
        ? "We couldn't send a code. Try again in a minute."
        : "We couldn't check that code. Try again.";
  }
}

function Lines({ items }: { items: readonly string[] }) {
  return (
    <ul className="body-sm public-list">
      {items.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

type Step =
  | { name: 'phone' }
  | { name: 'code'; e164: string }
  | { name: 'confirm'; e164: string; check: AccountDeletionCheck }
  | { name: 'done' };

function WebFlow({ client }: { client: SupabaseClient<Database> }) {
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function startOver() {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setStep({ name: 'phone' });
    setCode('');
    setTyped('');
    setError(null);
    setOutcome(null);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const n = normalizePhone(phone);
    if (!n.ok) return setError(n.error);
    setBusy(true);
    setError(null);
    // Never creates an account: only an existing one can be deleted.
    const { error: failed } = await client.auth.signInWithOtp({
      phone: n.e164,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (failed) return setError(authWords(failed, 'send'));
    setStep({ name: 'code', e164: n.e164 });
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (step.name !== 'code') return;
    if (code.length !== 6) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError(null);
    const { error: failed } = await client.auth.verifyOtp({
      phone: step.e164,
      token: code,
      type: 'sms',
    });
    if (failed) {
      setBusy(false);
      return setError(authWords(failed, 'verify'));
    }
    const { data, error: checkFailed } = await client.rpc('account_deletion_check');
    setBusy(false);
    if (checkFailed) return setError(errorWords(checkFailed));
    setStep({ name: 'confirm', e164: step.e164, check: data as unknown as AccountDeletionCheck });
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!isDeleteConfirmed(typed)) return setError(`Type ${accountDeleteConfirmWord} to confirm.`);
    setBusy(true);
    setError(null);
    const { data, error: failed } = await client.functions.invoke(accountDeleteFunction, {
      body: { confirm: accountDeleteConfirmWord, source: 'web' },
    });
    let out: DeleteOutcome;
    if (!failed) out = deleteOutcome(200, data);
    else if ((failed as { name?: string }).name === 'FunctionsFetchError')
      out = deleteOutcome(0, null);
    else {
      const ctx = (failed as { context?: unknown }).context as Response | undefined;
      const body: unknown =
        ctx && typeof ctx.json === 'function'
          ? await ctx
              .clone()
              .json()
              .catch(() => null)
          : null;
      out = deleteOutcome(ctx?.status ?? 500, body);
    }
    setBusy(false);
    if (out.kind === 'deleted') {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setStep({ name: 'done' });
    }
    setOutcome(out);
  }

  if (step.name === 'done') {
    return (
      <div role="status" data-testid="deleted">
        <p className="title">Your account is deleted.</p>
        <p className="body-sm">
          {`Shared games and results now show “${formerMemberName}”. You're signed out of this page.`}
        </p>
      </div>
    );
  }

  if (step.name === 'phone') {
    return (
      <form onSubmit={send} noValidate className="public-form">
        <div className="field">
          <label className="label" htmlFor="phone">
            Phone number on your account
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
            aria-describedby={error ? 'delete-error' : undefined}
          />
        </div>
        {error ? <FieldError id="delete-error" text={error} /> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Send code'}
        </button>
      </form>
    );
  }

  if (step.name === 'code') {
    return (
      <form onSubmit={verify} noValidate className="public-form">
        <p className="body-sm">
          We sent a code to <span className="num">{maskE164(step.e164)}</span>.
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
            aria-describedby={error ? 'delete-error' : undefined}
            autoFocus
          />
        </div>
        {error ? <FieldError id="delete-error" text={error} /> : null}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Checking' : 'Continue'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void startOver()}>
            Use another number
          </button>
        </div>
      </form>
    );
  }

  const blocked =
    outcome?.kind === 'blocked'
      ? outcome.sentences
      : step.check.blockers.map(accountBlockerSentence);
  return (
    <div className="public-form">
      <p className="body-sm">
        Signed in as <span className="num">{maskE164(step.e164)}</span>.
      </p>
      {blocked.length > 0 ? (
        <Notice kind="error" title="You can't delete your account yet.">
          {blocked.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </Notice>
      ) : (
        <form onSubmit={remove} noValidate className="public-form">
          <div className="field">
            <label className="label" htmlFor="confirm">
              Type {accountDeleteConfirmWord} to confirm
            </label>
            <input
              id="confirm"
              className="input"
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'delete-error' : undefined}
            />
          </div>
          {error ? <FieldError id="delete-error" text={error} /> : null}
          {outcome?.kind === 'error' ? (
            <FieldError id="delete-failed" text={outcome.words} />
          ) : null}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !isDeleteConfirmed(typed)}
          >
            {busy ? 'Deleting' : 'Delete my account'}
          </button>
        </form>
      )}
      <button className="btn btn-ghost" type="button" onClick={() => void startOver()}>
        Keep my account and sign out
      </button>
    </div>
  );
}

/** The public page (Google Play's account deletion web link). No staff session; nothing else of the tool. */
export function DeleteAccountPage() {
  const client = useMemo(makeClient, []);
  return (
    <main className="public-page" id="main">
      <p className="label muted">Ojoro</p>
      <h1 className="display display-sm">Delete your account</h1>
      <p className="body-sm">
        {
          "Deleting your Ojoro account can't be undone. You can do it in the app, or here with the phone number on your account."
        }
      </p>

      <section className="section" aria-labelledby="in-app">
        <h2 className="title" id="in-app">
          In the app
        </h2>
        <ol className="body-sm public-list">
          <li>Open Ojoro and go to You.</li>
          <li>Open the menu at the top, then Account.</li>
          <li>Tap Delete account, type {accountDeleteConfirmWord} and confirm.</li>
        </ol>
      </section>

      <section className="section" aria-labelledby="goes">
        <h2 className="title" id="goes">
          What goes
        </h2>
        <Lines items={accountDeletionGoes} />
        <h2 className="title" id="stays">
          {`What stays, as “${formerMemberName}”`}
        </h2>
        <p className="body-sm">
          {`Other people keep what you did together. Your name on it becomes “${formerMemberName}”, with no photo or profile.`}
        </p>
        <Lines items={accountDeletionStays} />
        <p className="body-sm muted">
          {
            'If you host a program that takes payments, any open dispute, refund or payout has to finish first. We tell you which one.'
          }
        </p>
      </section>

      <section className="section" aria-labelledby="here">
        <h2 className="title" id="here">
          Delete it here
        </h2>
        {client ? (
          <WebFlow client={client} />
        ) : (
          <Notice kind="error" title="This page isn't configured.">
            Delete your account in the app instead: You, the menu, Account, Delete account.
          </Notice>
        )}
      </section>
    </main>
  );
}
