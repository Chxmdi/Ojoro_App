// Step 5 e2e: the Challenge Event before it goes live (EventBuildup, Poster, EventToday), against the
// local Supabase stack and the Expo web app, with a spectator and two competitors.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/event-buildup.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (APP_URL or E2E_APP_URL,
// default http://localhost:8100) and Playwright. Re-runnable: it uses its own three test users (made
// with the local admin API, phones +1 555 555 985x, never the seeded people) and a fresh call-out and
// event every run; earlier runs' open events between them are cancelled first. Assertions compare
// against this run's own event, never global counts.
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
  x: { phone: '+15555559851', name: 'Tobi A' },
  y: { phone: '+15555559852', name: 'Remi K' },
  z: { phone: '+15555559853', name: 'Nneka S' },
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
  await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 180_000 });
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

async function tidy(ids) {
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

const view = async (person, eventId) => (await person.call('challenge_event_view', { p_event_id: eventId }))[0];

/** Wait until the server agrees (writes are optimistic; the screen may be ahead of the row). */
async function until(fn, message, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error(message);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
const contexts = [];
let exitCode = 0;

try {
  const x = await signIn(PEOPLE.x);
  const y = await signIn(PEOPLE.y);
  const z = await signIn(PEOPLE.z);
  await tidy([x.id, y.id]);

  // x calls y out for three days from now; y accepts. Public, so z (a stranger) can see it.
  const sent = await x.call('create_call_out', {
    p_idempotency_key: key(),
    p_sport_id: 'running',
    p_title: '5K',
    p_scoring: 'time',
    p_target: 5,
    p_unit: 'km',
    p_starts_at: inHours(72),
    p_opponent_id: y.id,
    p_audience: 'public',
    p_message: 'E2E build-up',
  });
  const accepted = await y.call('accept_call_out', { p_call_out_id: sent.call_out_id, p_idempotency_key: key() });
  const eventId = accepted.event_id;
  const path = `/event/${eventId}`;

  const Z = await browserAs(browser, z);
  const Y = await browserAs(browser, y);
  const X = await browserAs(browser, x);
  contexts.push(Z.ctx, Y.ctx, X.ctx);

  await step('a spectator sees the build-up: the challenger first, the countdown, 5K', async () => {
    await open(Z.page, path, 'event-buildup');
    await Z.page.getByRole('heading', { name: `${x.first} versus ${y.first}` }).first().waitFor();
    await Z.page.getByText('STARTS IN').first().waitFor();
    await Z.page.getByText('5K', { exact: true }).first().waitFor();
    await Z.page.getByText('BUILD-UP', { exact: true }).first().waitFor();
  });

  await step('a competitor sees their own side first', async () => {
    await open(Y.page, path, 'event-buildup');
    await Y.page.getByRole('heading', { name: `${y.first} versus ${x.first}` }).first().waitFor();
  });

  await step('FOLLOW is optimistic and lands once', async () => {
    const before = (await view(z, eventId)).follower_count;
    await Z.page.getByTestId('event-follow').click();
    await Z.page.getByText('Following', { exact: true }).waitFor();
    await until(async () => (await view(z, eventId)).i_follow === true, 'not following on the server');
    assert((await view(z, eventId)).follower_count === before + 1, 'follower count did not move by one');
  });

  await step('WHO TAKES IT? pick, then change it; social only', async () => {
    await Z.page.getByRole('radio', { name: new RegExp(`^${x.first.toUpperCase()}`) }).click();
    await Z.page.getByText('YOUR PICK').waitFor();
    await Z.page.getByText(`You picked ${x.first}.`, { exact: false }).waitFor();
    await Z.page.getByText('Social only: no money, no points, no odds.', { exact: false }).waitFor();
    await until(async () => (await view(z, eventId)).my_prediction === 'a', 'pick a not saved');
    await Z.page.getByRole('radio', { name: new RegExp(`^${y.first.toUpperCase()}`) }).click();
    await Z.page.getByText(`You picked ${y.first}.`, { exact: false }).waitFor();
    await until(async () => (await view(z, eventId)).my_prediction === 'b', 'changed pick not saved');
  });

  await step('BACK is separate from the pick, and tapping BACKING stops it', async () => {
    await Z.page.getByRole('button', { name: `Back ${x.first}` }).click();
    await Z.page.getByRole('button', { name: `Backing ${x.first}` }).waitFor();
    await until(async () => (await view(z, eventId)).my_backing === 'a', 'backing not saved');
    assert((await view(z, eventId)).my_prediction === 'b', 'backing changed the prediction');
    await Z.page.getByRole('button', { name: `Backing ${x.first}` }).click();
    await Z.page.getByRole('button', { name: `Back ${x.first}` }).waitFor();
    await until(async () => (await view(z, eventId)).my_backing === null, 'backing not stopped');
  });

  let zComment = null;
  await step('ADD TO THE CROWD posts a comment once', async () => {
    const body = `E2E comment ${randomUUID().slice(0, 8)}`;
    await Z.page.getByTestId('event-comment-input').fill(body);
    await Z.page.getByTestId('event-comment-send').click();
    await Z.page.getByText(body).waitFor();
    const rows = await z.call('challenge_comments', { p_event_id: eventId });
    assert(rows.filter((r) => r.body === body).length === 1, 'comment not stored exactly once');
    zComment = rows.find((r) => r.body === body).id;
  });

  await step("a competitor's post reaches the spectator's feed", async () => {
    const body = `E2E statement ${randomUUID().slice(0, 8)}`;
    await y.call('post_challenge_update', { p_event_id: eventId, p_kind: 'statement', p_body: body, p_idempotency_key: key() });
    await Z.page.getByText(body).waitFor({ timeout: 20_000 });
    await Z.page.getByText(`COMPETITOR · ${y.first.toUpperCase()}`).first().waitFor();
  });

  // Polish (GAPS-FEED): the followed event on Home, and replies and mentions in the crowd.
  await step('Home shows the followed event in its stage, in words, and opens it', async () => {
    await open(Z.page, '/', 'feed-end');
    const strip = Z.page.getByTestId(`feed-challenge-${eventId}`);
    await strip.waitFor({ timeout: 60_000 });
    const text = await strip.innerText();
    assert(text.includes(`${x.first} vs ${y.first} · 5K`), `strip title: ${text}`);
    assert(/ACCEPTED/.test(text) && /You follow · Accepted/.test(text), `strip words: ${text}`);
    if (process.env.E2E_SHOTS) {
      await strip.scrollIntoViewIfNeeded();
      await Z.page.screenshot({ path: join(process.env.E2E_SHOTS, 'home-challenge.png') });
    }
    await strip.click();
    await Z.page.getByTestId('event-buildup').first().waitFor({ timeout: 60_000 });
    assert(new URL(Z.page.url()).pathname === path, `opened ${Z.page.url()}`);
  });

  await step('a reply and an @mention reach the spectator once each, and open the event', async () => {
    const handle = `e2e_${z.id.slice(0, 8)}`;
    const { error } = await admin.from('profiles').update({ handle }).eq('id', z.id);
    assert(!error, `handle: ${error?.message}`);
    await y.call('comment_on_challenge', {
      p_event_id: eventId,
      p_body: 'Not a chance.',
      p_idempotency_key: key(),
      p_parent_id: zComment,
    });
    await x.call('comment_on_challenge', { p_event_id: eventId, p_body: `Watch this, @${handle}`, p_idempotency_key: key() });
    const rows = (await z.call('my_notifications', { p_limit: 50 })).filter((r) => r.object_id === eventId);
    const reply = rows.filter((r) => r.type === 'challenge_reply');
    const mention = rows.filter((r) => r.type === 'challenge_mention');
    assert(reply.length === 1 && reply[0].title === `${y.name} replied to your comment.`, `reply: ${JSON.stringify(reply)}`);
    assert(mention.length === 1 && mention[0].title === `${x.name} mentioned you.`, `mention: ${JSON.stringify(mention)}`);
    assert(reply[0].href === path && mention[0].href === path, 'not linked to the event');
    await open(Z.page, '/updates', 'updates-end');
    await Z.page.getByText(reply[0].title).first().waitFor();
    if (process.env.E2E_SHOTS) await Z.page.screenshot({ path: join(process.env.E2E_SHOTS, 'updates-challenge.png') });
    await Z.page.getByText(mention[0].title).first().click();
    await Z.page.getByTestId('event-buildup').first().waitFor({ timeout: 60_000 });
    assert(new URL(Z.page.url()).pathname === path, `opened ${Z.page.url()}`);
  });

  await step('report and block are one tap from the header', async () => {
    await Z.page.getByTestId('header-more').click();
    await Z.page.getByTestId('event-menu').waitFor();
    await Z.page.getByTestId('event-menu-report-a').waitFor();
    await Z.page.getByTestId('event-menu-report-b').waitFor();
    await Z.page.keyboard.press('Escape');
  });

  await step('the poster: names, 5K and the line; only public events (or your own) have one', async () => {
    // In-app navigation from the build-up (POSTER), so the shared dev server needn't serve a new page.
    await Z.page.getByTestId('event-poster-link').click();
    await Z.page.getByTestId('poster-art').waitFor({ timeout: 30_000 });
    await Z.page.getByText('CALL-OUT ACCEPTED').waitFor();
    await Z.page.getByText('WHO TAKES IT? FOLLOW, PREDICT AND BACK ON OJORO').waitFor();
    // Not public: the build-up drops the POSTER link; the server still gives competitors their own.
    await admin.from('challenge_events').update({ audience: 'participants' }).eq('id', eventId);
    const own = await y.client.rpc('challenge_poster', { p_event_id: eventId });
    assert(!own.error && own.data?.length === 1, `own poster: ${JSON.stringify(own.error)}`);
    await admin.from('challenge_events').update({ audience: 'public' }).eq('id', eventId);
  });

  await step('on the day: check in, I\'M READY, and it goes live', async () => {
    // Move the start into the check-in window (rules are fixed for people, not for the test).
    const startsAt = new Date(Date.now() + 20 * 60_000).toISOString();
    await admin
      .from('challenge_events')
      .update({ starts_at: startsAt, check_in_opens_at: new Date(Date.now() - 40 * 60_000).toISOString() })
      .eq('id', eventId);
    await open(X.page, path, 'event-today');
    await X.page.getByText('ALMOST TIME.').first().waitFor();
    await X.page.getByText('They lock the moment the race goes live.', { exact: false }).waitFor();
    await X.page.getByTestId('today-check-in').click();
    await X.page.getByTestId('today-checkin-a').getByText('CHECKED IN').waitFor();
    await y.call('check_in_challenge', { p_event_id: eventId });
    await X.page.getByTestId('today-checkin-b').getByText('CHECKED IN').waitFor({ timeout: 20_000 });
    await X.page.getByTestId('today-ready-button').click();
    await X.page.getByText(`The race goes live when ${y.first} is too.`, { exact: false }).waitFor();
    await y.call('ready_challenge', { p_event_id: eventId });
    await until(async () => (await view(x, eventId)).stage === 'live', 'not live');
    await X.page.getByTestId('event-today').waitFor({ state: 'detached', timeout: 20_000 });
  });

  await step('predictions lock at LIVE', async () => {
    const { error } = await z.client.rpc('predict_challenge', { p_event_id: eventId, p_side: 'a' });
    assert(error && /predictions_locked/.test(`${error.message} ${error.details ?? ''} ${error.hint ?? ''} ${error.code}`), `expected predictions_locked, got ${JSON.stringify(error)}`);
  });

  await step('an event you cannot see is words, not a crash', async () => {
    await open(Z.page, `/event/${randomUUID()}`, 'not-found');
  });

  await tidy([x.id, y.id]);
} catch {
  exitCode = 1;
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(exitCode || (failed ? 1 : 0));
}
