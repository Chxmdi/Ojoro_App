// Step 5 e2e: Compete and the Call-Out (ACCEPT / COUNTER / PASS, the composer, TAKE IT BACK,
// report/block) against the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/compete-callout.e2e.mjs
//
// Needs: `npx supabase start` (local stack with the Step 5 migrations), the Expo web dev server
// (APP_URL or E2E_APP_URL, default http://localhost:8100) and Playwright. Re-runnable: it uses its own
// two test users (made with the local admin API, phones +1 555 555 987x, never the seeded people),
// moves their earlier call-outs back two days so the 10-a-day limit never trips, and takes back
// whatever it leaves pending. Assertions never depend on global counts.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(here, '..', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const APP = process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100';
const PASSWORD = 'ojoro-e2e-password';

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
  challenger: { phone: '+15555559871', name: 'Kofi A' },
  opponent: { phone: '+15555559872', name: 'Zara M' },
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
/** A start two days out, on the half hour (create_call_out wants 1 h to 90 days ahead). */
const inDays = (d) => new Date(Math.ceil((Date.now() + d * 86_400_000) / 1_800_000) * 1_800_000).toISOString();

async function until(what, fn, timeout = 15_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function browserAs(browser, person) {
  const storageState = {
    cookies: [],
    origins: [{ origin: new URL(APP).origin, localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(person.session) }] }],
  };
  const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  return { ctx, page };
}

async function open(page, path, testId) {
  // The shared dev server can be slow to serve a page, or restart, while others rebuild: try again.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 180_000 });
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
      await sleep(20_000);
    }
  }
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

/** A call-out from the challenger to the opponent, through the RPC. */
async function sendCallOut(from, to, title) {
  const state = await from.call('create_call_out', {
    p_idempotency_key: key(),
    p_sport_id: 'running',
    p_title: title,
    p_scoring: 'time',
    p_starts_at: inDays(2),
    p_opponent_id: to.id,
    p_target: 5,
    p_unit: 'km',
    p_course_note: 'One loop from the monument',
    p_message: 'Bring your legs.',
  });
  return state.call_out_id;
}

/** Ends anything still pending between the two of us, so `call_out_pending` never blocks a run. */
async function clearPending(a, b) {
  for (const me of [a, b]) {
    const rows = await me.call('my_call_outs', { p_box: 'all', p_limit: 100 });
    for (const r of rows.filter((x) => x.status === 'proposed')) {
      if (r.direction === 'outgoing') await me.call('withdraw_call_out', { p_call_out_id: r.id }).catch(() => {});
      else await me.call('decline_call_out', { p_call_out_id: r.id }).catch(() => {});
    }
  }
}

/** At least `n` crews this person owns (made once, reused on later runs). */
async function ownedCrews(person, n) {
  const owned = async () => (await person.call('my_crews')).filter((c) => c.role === 'owner').map((c) => c.crew_id);
  let ids = await owned();
  while (ids.length < n) {
    await admin.from('crews').update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('created_by', person.id);
    await person.call('create_crew', { p_idempotency_key: key(), p_name: `${person.first} Runners ${ids.length + 1}`, p_sport_id: 'running' });
    ids = await owned();
  }
  return ids;
}

const browser = await chromium.launch();
let exitCode = 0;
const contexts = [];
let challenger;
let opponent;

try {
  challenger = await signIn(PEOPLE.challenger);
  opponent = await signIn(PEOPLE.opponent);
  // Leftovers from an earlier run: no blocks, nothing pending, and the daily limit reset.
  await challenger.call('unblock_user', { p_user_id: opponent.id }).catch(() => {});
  await opponent.call('unblock_user', { p_user_id: challenger.id }).catch(() => {});
  await clearPending(challenger, opponent);
  await admin
    .from('call_outs')
    .update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    .in('challenger_id', [challenger.id, opponent.id]);

  const Z = await browserAs(browser, opponent);
  contexts.push(Z.ctx);
  const tag = Date.now().toString(36).slice(-4).toUpperCase();
  let first;

  await step('Compete shows the incoming Call-Out with REPLY', async () => {
    first = await sendCallOut(challenger, opponent, `5K ${tag}`);
    await open(Z.page, '/compete', 'compete-screen');
    const block = Z.page.getByTestId('compete-incoming');
    await block.waitFor({ timeout: 30_000 });
    const text = await block.innerText();
    assert(/KOFI CALLED YOU OUT\./.test(text), `headline: ${text}`);
    assert(text.includes(`5K ${tag}`), `line: ${text}`);
    await Z.page.getByTestId('compete-reply').click();
    await Z.page.waitForURL(new RegExp(`/challenge/${first}$`), { timeout: 20_000 });
  });

  await step('CallOut shows the poster, the line and THE RULES with no stakes', async () => {
    await Z.page.getByTestId('call-out-screen').waitFor({ timeout: 30_000 });
    const body = await Z.page.getByTestId('call-out-screen').innerText();
    for (const want of ['CALL-OUT', 'PENDING', 'KOFI', 'ZARA', 'Bring your legs.', 'THE RULES', 'Person vs person', 'One loop from the monument', 'None. Bragging rights only.']) {
      assert(body.includes(want), `missing "${want}"`);
    }
    assert(/RECEIVED/.test(await Z.page.getByText(/RECEIVED .* AGO|RECEIVED JUST NOW/).first().innerText()), 'header overline');
  });

  await step('Report and block are in the header menu', async () => {
    await Z.page.getByTestId('header-more').click();
    await Z.page.getByText(/Report this Call-Out/i).first().waitFor({ timeout: 10_000 });
    await Z.page.getByText(/BLOCK KOFI/i).first().waitFor({ timeout: 10_000 });
    await Z.page.keyboard.press('Escape');
    await Z.page.getByText(/Report this Call-Out/i).first().waitFor({ state: 'hidden', timeout: 10_000 });
  });

  await step('ACCEPT twice makes exactly one Challenge Event and opens it', async () => {
    const accept = Z.page.getByTestId('call-out-accept');
    await accept.dblclick();
    await accept.click({ timeout: 2_000 }).catch(() => {});
    await Z.page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const eventId = Z.page.url().split('/event/')[1];
    const { data, error } = await admin.from('challenge_events').select('id').eq('call_out_id', first);
    assert(!error, error?.message);
    assert(data.length === 1 && data[0].id === eventId, `events for the call-out: ${JSON.stringify(data)}`);
    const [view] = await challenger.call('call_out_view', { p_call_out_id: first });
    assert(view.status === 'accepted' && view.event_id === eventId, `status ${view.status}`);
  });

  await step('The accepted Call-Out links to its event; Compete lists the event', async () => {
    await open(Z.page, `/challenge/${first}`, 'call-out-reply-event');
    await Z.page.getByTestId('call-out-open-event').waitFor();
    await open(Z.page, '/compete', 'compete-events');
    const events = await Z.page.getByTestId('compete-events').innerText();
    assert(/Zara vs Kofi/.test(events), `your side first: ${events}`);
  });

  let countered;
  let counter;
  await step('COUNTER sends only the change and opens the counter', async () => {
    countered = await sendCallOut(challenger, opponent, `10K ${tag}`);
    await open(Z.page, `/challenge/${countered}`, 'call-out-counter');
    await Z.page.getByTestId('call-out-counter').click();
    await Z.page.getByTestId('counter-sheet').waitFor();
    // Nothing changed yet: refused in words.
    await Z.page.getByTestId('counter-send').click();
    await Z.page.getByTestId('counter-nothing').waitFor({ timeout: 5_000 });
    await Z.page.getByTestId('counter-target').fill('8');
    await Z.page.getByTestId('counter-message').fill('Eight works better.');
    await Z.page.getByTestId('counter-send').click();
    await Z.page.waitForURL((u) => /\/challenge\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(countered), { timeout: 30_000 });
    counter = Z.page.url().split('/challenge/')[1];
    const [orig] = await opponent.call('call_out_view', { p_call_out_id: countered });
    assert(orig.status === 'countered' && orig.counter_id === counter, `original ${orig.status}`);
    const [next] = await challenger.call('call_out_view', { p_call_out_id: counter });
    assert(Number(next.target) === 8 && next.title === `10K ${tag}` && next.can_answer, `counter terms ${JSON.stringify(next)}`);
    await Z.page.getByTestId('call-out-reply-waiting').waitFor({ timeout: 20_000 });
  });

  await step('TAKE IT BACK withdraws your own pending Call-Out', async () => {
    await Z.page.getByTestId('call-out-withdraw').click();
    await Z.page.getByText('TAKE IT BACK?').waitFor();
    await Z.page.getByRole('button', { name: 'TAKE IT BACK', exact: true }).last().click();
    await until('withdrawn', async () => (await challenger.call('call_out_view', { p_call_out_id: counter }))[0].status === 'withdrawn');
    await Z.page.getByTestId('call-out-reply-closed').waitFor({ timeout: 20_000 });
  });

  await step('PASS asks first, then declines quietly', async () => {
    const passed = await sendCallOut(challenger, opponent, `Mile ${tag}`);
    await open(Z.page, `/challenge/${passed}`, 'call-out-pass');
    await Z.page.getByTestId('call-out-pass').click();
    await Z.page.getByText('PASS?').waitFor();
    await Z.page.getByRole('button', { name: 'PASS', exact: true }).last().click();
    await until('declined', async () => (await challenger.call('call_out_view', { p_call_out_id: passed }))[0].status === 'declined');
    await Z.page.getByText('You passed on this one.').waitFor({ timeout: 20_000 });
  });

  await step('Create offers CALL OUT, which opens the composer', async () => {
    await open(Z.page, '/create', 'create-call-out');
    await Z.page.getByTestId('create-call-out').click();
    await Z.page.waitForURL(/\/challenge\/new$/, { timeout: 20_000 });
    await Z.page.getByText('CALL SOMEONE OUT.').waitFor({ timeout: 30_000 });
  });

  await step('The composer, from a profile, sends one Call-Out per tap and opens it', async () => {
    await open(Z.page, `/profile/${challenger.id}`, 'profile-call-out');
    await Z.page.getByTestId('profile-call-out').click();
    await Z.page.getByTestId('call-out-composer').waitFor({ timeout: 30_000 });
    await Z.page.getByText('CALL OUT KOFI.').waitFor();
    // Empty: validation in words.
    await Z.page.getByTestId('composer-send').click();
    await Z.page.getByTestId('composer-invalid').waitFor({ timeout: 5_000 });
    await Z.page.getByTestId('sport-running').click();
    await Z.page.getByTestId('composer-title').fill(`Hill ${tag}`);
    await Z.page.getByTestId('composer-day-2').click();
    await Z.page.getByTestId('composer-time-540').click();
    await Z.page.getByTestId('composer-message').fill('Hills. Saturday.');
    await Z.page.getByTestId('composer-send').dblclick();
    await Z.page.waitForURL(/\/challenge\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const sent = Z.page.url().split('/challenge/')[1];
    await Z.page.getByTestId('call-out-reply-waiting').waitFor({ timeout: 20_000 });
    const mine = (await opponent.call('my_call_outs', { p_box: 'outgoing', p_limit: 100 })).filter((r) => r.title === `Hill ${tag}`);
    assert(mine.length === 1 && mine[0].id === sent, `call-outs sent: ${mine.length}`);
    await opponent.call('withdraw_call_out', { p_call_out_id: sent });
  });

  await step('An open crew Call-Out asks which crew, then accepts for it', async () => {
    const kofiCrew = await ownedCrews(challenger, 1);
    const zaraCrews = await ownedCrews(opponent, 2);
    const state = await challenger.call('create_call_out', {
      p_idempotency_key: key(),
      p_sport_id: 'running',
      p_title: `Relay ${tag}`,
      p_scoring: 'time',
      p_starts_at: inDays(3),
      p_challenger_crew_id: kofiCrew[0],
      p_side_size: 3,
    });
    await open(Z.page, `/challenge/${state.call_out_id}`, 'call-out-accept');
    await Z.page.getByTestId('call-out-accept').click();
    await Z.page.getByTestId('accept-crew-sheet').waitFor({ timeout: 10_000 });
    await Z.page.getByTestId(`accept-crew-${zaraCrews[1]}`).click();
    await Z.page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const { data } = await admin.from('challenge_events').select('a_crew_id, b_crew_id').eq('call_out_id', state.call_out_id);
    assert(data.length === 1 && data[0].a_crew_id === kofiCrew[0] && data[0].b_crew_id === zaraCrews[1], `event crews ${JSON.stringify(data)}`);
  });
} catch (error) {
  exitCode = 1;
  if (process.env.E2E_SHOTS) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(process.env.E2E_SHOTS, `fail-${i}.png`) }).catch(() => {});
    }
  }
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  if (challenger && opponent) await clearPending(challenger, opponent).catch(() => {});
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} steps passed`);
process.exit(exitCode || (passed === results.length ? 0 : 1));
