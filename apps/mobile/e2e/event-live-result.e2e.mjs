// Step 5 e2e: a Challenge Event from LIVE to the verified result, against the local Supabase stack
// and the Expo web app, with two competitors and a watcher in three browser contexts:
// EventLive (lanes, freshness, locked predictions, CHEER THEM ON, LOG PROGRESS, WE’RE DONE),
// Verifying (NOT FINAL numbers, REQUEST A CORRECTION, withdraw, CONFIRM BOTH TIMES), Result (the
// recap, the crowd's call, the rivalry) and RUN IT BACK (a new linked Call-Out).
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/event-live-result.e2e.mjs
//
// Re-runnable: its own three test users (local admin API, phones +1 555 555 986x, never the seeded
// people); a fresh Call-Out every run (older e2e call-outs are moved back a day and any left
// pending are withdrawn, so the 10-a-day limit and the one-pending rule never trip). E2E_SHOTS=<dir>
// saves screenshots of each screen (and of every page at a failure).
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(here, '..', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const APP = process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100';
const SHOTS = process.env.E2E_SHOTS ?? null;
const PASSWORD = 'ojoro-e2e-password';

// ---------------------------------------------------------------------------------------------
// Supabase

function readEnv() {
  let out = [];
  try {
    out = execSync('npx supabase status -o env', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
      });
  } catch {
    // Fall through to the app's config below.
  }
  const env = Object.fromEntries(out);
  if (!env.PUBLISHABLE_KEY) {
    const dotenv = readFileSync(join(here, '..', '.env'), 'utf8');
    env.PUBLISHABLE_KEY = /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/.exec(dotenv)?.[1]?.trim();
  }
  return env;
}

const env = readEnv();
const URL_ = env.API_URL ?? 'http://127.0.0.1:54321';
const admin = createClient(URL_, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PEOPLE = {
  kemi: { phone: '+15555559861', name: 'Kemi A' },
  remi: { phone: '+15555559862', name: 'Remi B' },
  sola: { phone: '+15555559863', name: 'Sola C' },
};

async function signIn({ phone, name }) {
  const client = createClient(URL_, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  let res = await client.auth.signInWithPassword({ phone, password: PASSWORD });
  if (res.error) {
    const made = await admin.auth.admin.createUser({
      phone,
      password: PASSWORD,
      phone_confirm: true,
      user_metadata: { display_name: name },
    });
    if (made.error) throw new Error(`create ${name}: ${made.error.message}`);
    res = await client.auth.signInWithPassword({ phone, password: PASSWORD });
    if (res.error) throw new Error(`sign in ${name}: ${res.error.message}`);
  }
  const call = async (fn, args = {}) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const e = new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
      e.code = error.message;
      throw e;
    }
    return data;
  };
  await call('save_onboarding', {
    p_sports: [{ sport_id: 'running', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_pull_me_in: [],
    p_display_name: name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
  return { client, call, session: res.data.session, id: res.data.user.id, name, first: name.split(' ')[0] };
}

const key = () => randomUUID();

async function until(what, fn, timeout = 15_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn().catch(() => null);
    if (last) return last;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function expectError(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (!String(e.message).includes(code)) throw new Error(`expected ${code}, got ${e.message}`, { cause: e });
    return;
  }
  throw new Error(`expected ${code}, but it went through`);
}

// ---------------------------------------------------------------------------------------------
// Browser

const contexts = [];
async function browserAs(browser, person) {
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: new URL(APP).origin,
        localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(person.session) }],
      },
    ],
  };
  const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  return { ctx, page };
}

async function open(page, path, testId) {
  await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 180_000 });
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 60_000 });
}

async function shot(page, name) {
  if (!SHOTS) return;
  await sleep(600);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => {});
}

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}\n     ${error.message}`);
    throw error;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
const cleanup = [];
let exitCode = 0;

try {
  const kemi = await signIn(PEOPLE.kemi);
  const remi = await signIn(PEOPLE.remi);
  const sola = await signIn(PEOPLE.sola);
  const ids = [kemi.id, remi.id, sola.id];
  // Leftovers from an earlier run: older e2e call-outs out of the 24 h limit, none left pending.
  await admin.from('call_outs').update({ status: 'withdrawn' }).in('challenger_id', ids).eq('status', 'proposed');
  await admin
    .from('call_outs')
    .update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    .in('challenger_id', ids);
  for (const p of [kemi, remi, sola]) {
    for (const other of ids) if (other !== p.id) await p.call('unblock_user', { p_user_id: other }).catch(() => {});
  }

  let eventId;
  const view = async (who = sola) => (await who.call('challenge_event_view', { p_event_id: eventId }))[0];

  await step('setup: Kemi calls Remi out, Remi accepts, Sola follows and picks Kemi', async () => {
    // Starts just over an hour away: check-in opens an hour before the start.
    const startsAt = new Date(Date.now() + 60 * 60_000 + 20_000).toISOString();
    const out = await kemi.call('create_call_out', {
      p_idempotency_key: key(),
      p_sport_id: 'running',
      p_title: '5K',
      p_scoring: 'time',
      p_target: 5,
      p_unit: 'km',
      p_starts_at: startsAt,
      p_opponent_id: remi.id,
      p_message: 'Saturday. Bring your legs.',
      p_audience: 'public',
    });
    const callOutId = out.call_out_id ?? out.id;
    assert(callOutId, `no call-out id in ${JSON.stringify(out)}`);
    const accepted = await remi.call('accept_call_out', { p_call_out_id: callOutId, p_idempotency_key: key() });
    eventId = accepted.event_id;
    assert(eventId, `no event id in ${JSON.stringify(accepted)}`);
    await sola.call('follow_challenge_event', { p_event_id: eventId });
    await sola.call('predict_challenge', { p_event_id: eventId, p_side: 'a' });
  });

  await step('setup: both check in and are ready, so it goes LIVE', async () => {
    await until('check-in to open', () => kemi.call('check_in_challenge', { p_event_id: eventId }).then(() => true), 60_000);
    await remi.call('check_in_challenge', { p_event_id: eventId });
    await kemi.call('ready_challenge', { p_event_id: eventId });
    await remi.call('ready_challenge', { p_event_id: eventId });
    const v = await view();
    assert(v.stage === 'live', `expected live, got ${v.stage}`);
    assert(v.predictions_locked === true, 'predictions should lock at LIVE');
    await expectError(sola.call('predict_challenge', { p_event_id: eventId, p_side: 'b' }), 'predictions_locked');
  });

  const K = await browserAs(browser, kemi);
  const R = await browserAs(browser, remi);
  const S = await browserAs(browser, sola);

  await step('EventLive (watcher): lanes, locked predictions, no competitor actions', async () => {
    await open(S.page, `/event/${eventId}`, 'event-live');
    await S.page.getByTestId('stage-overline').getByText('KEMI VS REMI · 5K').waitFor();
    await S.page.getByTestId('live-challenge').waitFor();
    await S.page.getByTestId('live-freshness').getByText(/^Nothing logged yet/).waitFor();
    await S.page.getByTestId('live-predictions').getByText(/You picked Kemi\./).waitFor();
    assert((await S.page.getByTestId('live-competitor-actions').count()) === 0, 'a watcher must not get competitor actions');
  });

  await step('CHEER THEM ON toggles LET’S GO (optimistic, then the server agrees)', async () => {
    const letsGo = S.page.getByTestId('live-cheer').getByRole('button', { name: /^Let’s go/ });
    await letsGo.click();
    await until('LET’S GO counted', async () => (await view()).my_reaction === 'lets_go');
    await S.page.getByTestId('live-cheer').getByRole('button', { name: /you reacted/ }).waitFor({ timeout: 10_000 });
    await letsGo.click();
    await until('LET’S GO taken back', async () => (await view()).my_reaction === null);
  });

  await step('LOG PROGRESS (competitor): the lanes move for everyone, labelled by who logged it', async () => {
    await open(K.page, `/event/${eventId}`, 'event-live');
    await K.page.getByTestId('live-log-progress').click();
    await K.page.getByTestId('progress-a').fill('3.4');
    await K.page.getByTestId('progress-b').fill('nope');
    await K.page.getByTestId('progress-save').click();
    await K.page.getByText(/That isn't a number of km/).waitFor();
    await K.page.getByTestId('progress-b').fill('3.1');
    await K.page.getByTestId('progress-save').click();
    await until('progress saved', async () => {
      const v = await view();
      return Number(v.a_progress) === 3.4 && Number(v.b_progress) === 3.1;
    });
    // The same numbers again change nothing (set-to-state).
    const again = await kemi.call('log_challenge_progress', { p_event_id: eventId, p_a_value: 3.4, p_b_value: 3.1 });
    assert(again.changed === false, 'logging the same numbers again should change nothing');
    await expectError(sola.call('log_challenge_progress', { p_event_id: eventId, p_a_value: 5 }), 'not_competitor');
    await S.page.getByTestId('live-freshness').getByText(/logged by Kemi, a competitor/).waitFor({ timeout: 20_000 });
    await shot(S.page, 'EventLive-watcher');
    await shot(K.page, 'EventLive-competitor');
  });

  await step('WE’RE DONE: validation in words, then the result is sent NOT FINAL', async () => {
    await K.page.getByTestId('live-submit-result').click();
    await K.page.getByTestId('result-a').fill('22:48');
    await K.page.getByTestId('result-send').click();
    await K.page.getByText(/Add Remi's time\./).waitFor();
    await K.page.getByTestId('result-b').fill('23:31');
    await K.page.getByTestId('result-note').fill('Out hard, held it through the last climb');
    await K.page.getByTestId('result-send').click();
    await K.page.getByTestId('event-verifying').waitFor({ timeout: 20_000 });
    await K.page.getByTestId('verifying-a').getByText('22:48').waitFor();
    await K.page.getByTestId('verifying-waiting').waitFor();
    await expectError(
      sola.call('submit_challenge_result', { p_event_id: eventId, p_a_value: 1, p_b_value: 2, p_idempotency_key: key() }),
      'not_competitor',
    );
  });

  await step('Verifying (watcher): nobody is called the winner, numbers stay with the competitors', async () => {
    await S.page.getByTestId('event-verifying').waitFor({ timeout: 20_000 });
    await S.page.getByTestId('verifying-watcher').waitFor();
    assert((await S.page.getByText('22:48').count()) === 0, 'the watcher must not see unconfirmed numbers');
    assert((await S.page.getByText(/WINS\./).count()) === 0, 'nobody is the winner while verifying');
  });

  await step('REQUEST A CORRECTION pauses it (ON HOLD.); withdrawing resumes it', async () => {
    await open(R.page, `/event/${eventId}`, 'event-verifying');
    await R.page.getByTestId('check-them').getByText('Kemi confirmed both times').waitFor();
    await R.page.getByTestId('check-me').getByText('Your confirmation').waitFor();
    await shot(R.page, 'Verifying');
    await R.page.getByTestId('verifying-correct').click();
    await R.page.getByTestId('correction-note').fill('My time was 23:21.');
    await R.page.getByTestId('correction-send').click();
    await R.page.getByTestId('event-disputed').waitFor({ timeout: 20_000 });
    await R.page.getByTestId('verifying-correction').getByText(/My time was 23:21/).waitFor();
    // Idempotent while open.
    const again = await remi.call('request_challenge_correction', { p_event_id: eventId });
    assert(again.stage === 'disputed', `still disputed, got ${again.stage}`);
    await expectError(
      remi.call('confirm_challenge_result', {
        p_submission_id: (await remi.call('challenge_verification', { p_event_id: eventId }))[0].submission_id,
        p_idempotency_key: key(),
      }),
      'correction_open',
    );
    await shot(R.page, 'Verifying-disputed');
    await R.page.getByTestId('verifying-withdraw').click();
    await R.page.getByTestId('event-verifying').waitFor({ timeout: 20_000 });
  });

  await step('CONFIRM BOTH TIMES makes it final: Result shows the winner, the crowd and the rivalry', async () => {
    await R.page.getByTestId('verifying-confirm').click();
    await R.page.getByRole('button', { name: 'CONFIRM', exact: true }).last().click();
    await R.page.getByTestId('event-result').waitFor({ timeout: 20_000 });
    await R.page.getByText('KEMI WINS.').first().waitFor();
    await R.page.getByTestId('result-rivalry').getByText('Rivalry with Kemi').waitFor();
    const v = await view();
    assert(v.stage === 'complete' && v.winner_side === 'a', `expected complete with a winning, got ${v.stage} ${v.winner_side}`);
    // A confirmation retried with a fresh key changes nothing; the result is never rewritten.
    const sub = (await remi.call('challenge_verification', { p_event_id: eventId }))[0].submission_id;
    const again = await remi.call('confirm_challenge_result', { p_submission_id: sub, p_idempotency_key: key() });
    assert(again.verified === true, 'confirming again keeps it verified');
    await expectError(
      kemi.call('submit_challenge_result', { p_event_id: eventId, p_a_value: 1, p_b_value: 2, p_idempotency_key: key() }),
      'result_already_verified',
    );
    await shot(R.page, 'Result');
  });

  await step('Result (watcher): the crowd’s call and your pick', async () => {
    await S.page.getByTestId('event-result').waitFor({ timeout: 20_000 });
    await S.page.getByTestId('result-predictions').getByText(/You called it\./).waitFor();
    assert((await S.page.getByTestId('recap-run-it-back').count()) === 0, 'watchers cannot ask for a rematch');
    await shot(S.page, 'Result-watcher');
  });

  await step('RUN IT BACK (Kemi) sends a new linked Call-Out; the old result is untouched', async () => {
    await open(K.page, `/event/${eventId}`, 'event-result');
    await K.page.getByTestId('recap-run-it-back').click();
    await K.page.getByRole('button', { name: 'RUN IT BACK', exact: true }).last().click();
    await K.page.waitForURL(/\/challenge\/[0-9a-f-]+$/, { timeout: 20_000 });
    const callOutId = K.page.url().split('/challenge/')[1];
    cleanup.push(() => kemi.call('withdraw_call_out', { p_call_out_id: callOutId }));
    const v = await view(kemi);
    assert(v.pending_rematch_call_out_id === callOutId, 'the event links the pending rematch');
    assert(v.winner_side === 'a' && Number(v.result_a) === 1368, 'the finished result stays as it was');
  });
} catch (error) {
  exitCode = 1;
  if (SHOTS) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(SHOTS, `fail-${i}.png`) }).catch(() => {});
    }
  }
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const undo of cleanup.reverse()) {
    try {
      await undo();
    } catch {
      // Already answered.
    }
  }
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} steps passed`);
process.exit(exitCode || (passed === results.length ? 0 : 1));
