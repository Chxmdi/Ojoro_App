// Step 5 e2e: Rivalry & rematch, against the local Supabase stack and the Expo web app, with two
// people in two browser contexts.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/rivalry.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (APP_URL or E2E_APP_URL,
// default http://localhost:8100) and Playwright. Re-runnable: it uses its own two test users (made
// with the local admin API, phones +1 555 555 984x, never the seeded people). Each run plays one
// more verified meeting between them (call-out → accept → live (admin) → submit → confirm), so the
// rivalry grows by one meeting per run; assertions compare before/after, never global counts.
// Leftover pending call-outs and open events between the two are closed first.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(here, '..', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const APP = process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100';
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
  x: { phone: '+15555559841', name: 'Kemi R' },
  y: { phone: '+15555559842', name: 'Dayo L' },
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
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
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
const inHours = (h) => new Date(Math.ceil((Date.now() + h * 3_600_000) / 60_000) * 60_000).toISOString();

// ---------------------------------------------------------------------------------------------
// Browser

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
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  return { ctx, page };
}

async function open(page, path, testId) {
  // The shared dev server can take a while to serve a page; give it room.
  await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 180_000 });
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 60_000 });
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

/** Close whatever an earlier run left open between the two, and keep them under 10 call-outs a day. */
async function tidy(x, y) {
  const ids = [x.id, y.id];
  await admin
    .from('call_outs')
    .update({ status: 'withdrawn', responded_at: new Date().toISOString() })
    .eq('status', 'proposed')
    .in('challenger_id', ids);
  await admin
    .from('call_outs')
    .update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    .in('challenger_id', ids);
  await admin
    .from('challenge_events')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'called_off' })
    .in('status', ['scheduled', 'live', 'verifying', 'disputed'])
    .in('a_user_id', ids);
}

/** One verified meeting: x calls y out, y accepts, the event goes live (admin), x submits, y confirms. */
async function playMeeting(x, y, a, b) {
  const sent = await x.call('create_call_out', {
    p_idempotency_key: key(),
    p_sport_id: 'running',
    p_title: '5K',
    p_scoring: 'time',
    p_starts_at: inHours(2),
    p_opponent_id: y.id,
    p_message: 'E2E rivalry run',
  });
  const accepted = await y.call('accept_call_out', { p_call_out_id: sent.call_out_id, p_idempotency_key: key() });
  const eventId = accepted.event_id;
  const live = await admin
    .from('challenge_events')
    .update({ status: 'live', live_at: new Date().toISOString() })
    .eq('id', eventId);
  if (live.error) throw new Error(`go live: ${live.error.message}`);
  const view = (await x.call('challenge_event_view', { p_event_id: eventId }))[0];
  // Values are per event side; x is the challenger (side a of the event).
  assert(view, 'event view');
  const submitted = await x.call('submit_challenge_result', {
    p_event_id: eventId,
    p_a_value: a,
    p_b_value: b,
    p_idempotency_key: key(),
  });
  await y.call('confirm_challenge_result', { p_submission_id: submitted.submission_id, p_idempotency_key: key() });
  const done = (await x.call('challenge_event_view', { p_event_id: eventId }))[0];
  assert(done.status === 'complete', `expected complete, got ${done.status}`);
  return { eventId, rivalryId: accepted.rivalry_id };
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
const contexts = [];
let exitCode = 0;

try {
  const x = await signIn(PEOPLE.x);
  const y = await signIn(PEOPLE.y);
  await x.call('unblock_user', { p_user_id: y.id }).catch(() => {});
  await y.call('unblock_user', { p_user_id: x.id }).catch(() => {});
  await tidy(x, y);

  const X = await browserAs(browser, x);
  const Y = await browserAs(browser, y);
  contexts.push(X.ctx, Y.ctx);

  let rivalryId;
  let lastEventId;
  let before;

  await step('a verified meeting puts the pair in a rivalry', async () => {
    // 22:48 vs 23:31: x wins by 43 s.
    const m = await playMeeting(x, y, 1368, 1411);
    rivalryId = m.rivalryId;
    lastEventId = m.eventId;
    before = (await x.call('rivalry_view', { p_rivalry_id: rivalryId }))[0];
    assert(before.i_am_in && before.meetings >= 1 && before.last_event_id === lastEventId, `view: ${JSON.stringify(before)}`);
  });

  await step('Rivalry shows the record, form, the meeting linking to its result, and LAST TIME', async () => {
    await open(X.page, `/rivalry/${rivalryId}`, 'rivalry-screen');
    await X.page.getByText(`${x.first} · ${y.first}`.toUpperCase(), { exact: true }).first().waitFor();
    const record = await X.page.getByLabel(/^Rivalry\. /).first().getAttribute('aria-label');
    assert(new RegExp(`after ${before.meetings} meeting`).test(record ?? ''), `record: ${record}`);
    const row = X.page.getByTestId(`rivalry-meeting-${lastEventId}`);
    await row.waitFor({ timeout: 20_000 });
    const text = await row.innerText();
    assert(/22:48 vs 23:31/.test(text) && /participant confirmed/.test(text), `meeting row: ${text}`);
    assert(text.includes(x.first.toUpperCase()), `winner badge: ${text}`);
    await X.page.getByText(`LAST TIME · ${x.first.toUpperCase()} BY 43S`).first().waitFor();
    await X.page.getByTestId('rivalry-rematch-offer').waitFor();
    await row.click();
    await X.page.waitForURL(new RegExp(`/event/${lastEventId}$`), { timeout: 20_000 });
  });

  await step('report and block are one tap away from the Rivalry', async () => {
    await open(Y.page, `/rivalry/${rivalryId}`, 'rivalry-screen');
    await Y.page.getByTestId('header-more').click();
    await Y.page.getByText(/report this event/i).first().waitFor({ timeout: 15_000 });
    await Y.page.keyboard.press('Escape');
    await Y.page.reload({ waitUntil: 'load' });
    await Y.page.getByTestId('rivalry-screen').waitFor({ timeout: 60_000 });
  });

  let firstAsk;
  await step('the loser asks: RUN IT BACK sends one linked rematch Call-Out (double tap, still one)', async () => {
    await Y.page.getByTestId('rivalry-run-it-back').dblclick();
    await Y.page.getByTestId('rivalry-rematch-waiting').waitFor({ timeout: 20_000 });
    await Y.page.getByText(`You asked for a rematch. Waiting on ${x.first}.`).waitFor();
    const { data } = await admin
      .from('call_outs')
      .select('id, status, rematch_of_event_id, rivalry_id')
      .eq('rematch_of_event_id', lastEventId)
      .eq('status', 'proposed');
    assert(data?.length === 1 && data[0].rivalry_id === rivalryId, `rematch call-outs: ${JSON.stringify(data)}`);
    firstAsk = data[0].id;
    // The Call-Out link opens it.
    await Y.page.getByTestId('rivalry-call-out-link').click();
    await Y.page.waitForURL(new RegExp(`/challenge/${firstAsk}$`), { timeout: 20_000 });
  });

  await step('the other side sees REMATCH? and NOT YET declines it, without blame (and again changes nothing)', async () => {
    await open(X.page, `/rivalry/${rivalryId}`, 'rivalry-rematch-answer');
    await X.page.getByText(`wants the 5K again.`, { exact: false }).first().waitFor();
    await X.page.getByText(/Accepting creates a new Call-Out linked to this rivalry\./).waitFor();
    await X.page.getByRole('button', { name: 'NOT YET' }).click();
    await X.page.getByTestId('rivalry-rematch-offer').waitFor({ timeout: 20_000 });
    const again = await x.call('decline_call_out', { p_call_out_id: firstAsk });
    assert(again.status === 'declined' && again.created === false, `second decline: ${JSON.stringify(again)}`);
  });

  await step('asked again and accepted: exactly one new linked event, and the old result stays as it was', async () => {
    const ask = await y.call('run_it_back_challenge', { p_event_id: lastEventId, p_idempotency_key: key() });
    assert(ask.created === true && ask.accepted === false, `ask: ${JSON.stringify(ask)}`);
    await open(X.page, `/rivalry/${rivalryId}`, 'rivalry-rematch-answer');
    await X.page.getByRole('button', { name: 'RUN IT BACK' }).dblclick();
    await X.page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const newEventId = /\/event\/([0-9a-f-]{36})/.exec(X.page.url())[1];
    assert(newEventId !== lastEventId, 'went to the old event');
    const { data: events } = await admin
      .from('challenge_events')
      .select('id, rivalry_id, rematch_of_event_id, status')
      .eq('rematch_of_event_id', lastEventId);
    assert(events?.length === 1 && events[0].id === newEventId && events[0].rivalry_id === rivalryId, `events: ${JSON.stringify(events)}`);
    const meetings = await x.call('rivalry_meetings', { p_rivalry_id: rivalryId });
    const old = meetings.find((m) => m.event_id === lastEventId);
    assert(old && Number(old.a_value) === 1368 && Number(old.b_value) === 1411 && old.winner === 'a', `old result: ${JSON.stringify(old)}`);
    const after = (await x.call('rivalry_view', { p_rivalry_id: rivalryId }))[0];
    assert(after.meetings === before.meetings && after.a_wins === before.a_wins, 'the record changed without a new result');
    assert(after.next_event_id === newEventId, `next: ${after.next_event_id}`);
  });

  await step('with the rematch scheduled, Rivalry shows NEXT and links to it', async () => {
    await open(Y.page, `/rivalry/${rivalryId}`, 'rivalry-scheduled');
    await Y.page.getByLabel(/^Next: 5K · /).first().waitFor();
    await Y.page.getByTestId('rivalry-next-event').click();
    await Y.page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  });

  await step('a rivalry you cannot see is words, not a crash', async () => {
    await open(X.page, `/rivalry/${randomUUID()}`, 'rivalry-unavailable');
    await X.page.getByText("We can't find this rivalry.").waitFor();
  });
} catch {
  exitCode = 1;
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(exitCode || (failed ? 1 : 0));
}
