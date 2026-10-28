// Slice 01 e2e: Activity → Check-in → After → Recap → Run It Back, against the local Supabase stack
// and the Expo web app.
//
//   node apps/mobile/e2e/activity-recap.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (E2E_APP_URL, default
// http://localhost:8100) and Playwright. Re-runnable: it uses its own four test users (made with the
// local admin API, phone + password, never the seeded people) and builds fresh plans every run, then
// cancels what it left forming so nobody else's screens change.
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

const APP = process.env.E2E_APP_URL ?? 'http://localhost:8100';
const PASSWORD = 'ojoro-e2e-password';
const PLACE = { lat: 45.5165, lng: -73.5862 }; // Jeanne-Mance Park (seed)
const FAR = { lat: 45.5265, lng: -73.6012 }; // ~1.6 km away

// ---------------------------------------------------------------------------------------------
// Supabase

function readEnv() {
  const out = execSync('npx supabase status -o env', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    });
  const env = Object.fromEntries(out);
  if (!env.PUBLISHABLE_KEY) {
    // Fall back to the app's own public config.
    const dotenv = readFileSync(join(here, '..', '.env'), 'utf8');
    env.PUBLISHABLE_KEY = /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/.exec(dotenv)?.[1]?.trim();
  }
  return env;
}

const env = readEnv();
const URL_ = env.API_URL ?? 'http://127.0.0.1:54321';
const admin = createClient(URL_, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PEOPLE = {
  host: { phone: '+15555559911', name: 'Kemi A' },
  me: { phone: '+15555559912', name: 'Remi O' },
  player: { phone: '+15555559913', name: 'Femi T' },
  waiter: { phone: '+15555559914', name: 'Bayo K' },
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
  const call = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
  await call('save_onboarding', {
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_pull_me_in: [{ sport_id: 'football', scope: 'nearby' }],
    p_display_name: name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
  return { client, call, session: res.data.session, id: res.data.user.id, name };
}

const key = () => randomUUID();
const inMinutes = (m) => new Date(Math.ceil((Date.now() + m * 60_000) / 60_000) * 60_000).toISOString();

async function placeId(client) {
  const { data, error } = await client.from('places').select('id').eq('name', 'Jeanne-Mance Park').single();
  if (error) throw error;
  return data.id;
}

async function card(person, activityId) {
  const { data, error } = await person.client.from('activity_cards').select('*').eq('id', activityId).single();
  if (error) throw error;
  return data;
}

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

// ---------------------------------------------------------------------------------------------
// Browser

async function browserAs(browser, person, at = PLACE) {
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: new URL(APP).origin,
        localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(person.session) }],
      },
    ],
  };
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    geolocation: { latitude: at.lat, longitude: at.lng },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  return { ctx, page };
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
  const host = await signIn(PEOPLE.host);
  const me = await signIn(PEOPLE.me);
  const player = await signIn(PEOPLE.player);
  const waiter = await signIn(PEOPLE.waiter);
  const place = await placeId(host.client);

  // 1. Cancelling frees the spot for the waitlist ------------------------------------------------
  let gameA;
  await step('waitlist game: plan of 2 locks at GAME ON, a third joins the waitlist', async () => {
    const plan = await host.call('create_plan', {
      p_idempotency_key: key(),
      p_sport_id: 'football',
      p_starts_at: inMinutes(180),
      p_capacity: 2,
      p_place_id: place,
      p_title: 'E2E waitlist game',
      p_meeting_point: 'North pitch',
      p_meeting_lat: PLACE.lat,
      p_meeting_lng: PLACE.lng,
    });
    const locked = await me.call('im_down', { p_plan_id: plan.plan_id, p_idempotency_key: key() });
    assert(locked.status === 'game_on' && locked.activity_id, `expected GAME ON, got ${locked.status}`);
    gameA = locked.activity_id;
    cleanup.push(() => host.call('cancel_activity', { p_activity_id: gameA }));
    const w = await waiter.call('join_waitlist', { p_activity_id: gameA, p_idempotency_key: key() });
    assert(w.status === 'waitlisted', `waiter should be waitlisted, got ${w.status}`);
  });

  await step("I CAN'T MAKE IT ANYMORE frees the spot and promotes the waitlist", async () => {
    const { ctx, page } = await browserAs(browser, me);
    await page.goto(`${APP}/activity/${gameA}`, { waitUntil: 'load', timeout: 90_000 });
    await page.getByTestId('cant-make-it').click({ timeout: 20_000 });
    await page.getByRole('button', { name: "I CAN'T MAKE IT", exact: true }).click();
    await until('the waitlisted player to be promoted', async () => (await card(waiter, gameA)).my_attendance === 'confirmed');
    const mine = await card(me, gameA);
    assert(mine.my_attendance === 'cancelled', `my attendance should be cancelled, got ${mine.my_attendance}`);
    // Full again, so the screen offers the waitlist; joining shows where you are.
    await page.getByTestId('join-waitlist').click({ timeout: 15_000 });
    await page.getByTestId('waitlisted').waitFor({ timeout: 15_000 });
    await ctx.close();
  });

  // 2. Check in, play, confirm, recap, run it back ----------------------------------------------
  let gameB;
  await step('game: invite-only plan of 3 starting in 20 min locks at GAME ON', async () => {
    const plan = await host.call('create_plan', {
      p_idempotency_key: key(),
      p_sport_id: 'football',
      p_starts_at: inMinutes(20),
      p_capacity: 3,
      p_place_id: place,
      p_audience: 'invite_only',
      p_title: 'E2E pickup football',
      p_meeting_point: 'North pitch, by the lights',
      p_meeting_lat: PLACE.lat,
      p_meeting_lng: PLACE.lng,
      p_team_a_label: 'Lights',
      p_team_b_label: 'Darks',
      p_teams_note: 'Lights vs Darks. Bring both shirts.',
      p_kit_note: 'Ball and bibs: Kemi.',
      p_level_label: 'Mixed level',
    });
    await host.call('pull_in', {
      p_plan_id: plan.plan_id,
      p_invitee_ids: [me.id, player.id],
      p_idempotency_key: key(),
    });
    await me.call('im_down', { p_plan_id: plan.plan_id, p_idempotency_key: key() });
    const locked = await player.call('im_down', { p_plan_id: plan.plan_id, p_idempotency_key: key() });
    assert(locked.status === 'game_on', `expected GAME ON, got ${locked.status}`);
    gameB = locked.activity_id;
  });

  await step('check-in away from the pitch fails with words and a next step', async () => {
    const { ctx, page } = await browserAs(browser, me, FAR);
    await page.goto(`${APP}/activity/${gameB}`, { waitUntil: 'load', timeout: 90_000 });
    await page.getByTestId('check-in-button').click({ timeout: 20_000 });
    const error = page.getByTestId('check-in-error');
    await error.waitFor({ timeout: 15_000 });
    const text = await error.innerText();
    assert(/away/.test(text) && /150 m/.test(text), `unexpected error text: ${text}`);
    assert((await card(me, gameB)).my_attendance === 'confirmed', 'should still be confirmed, not checked in');
    await ctx.close();
  });

  await step("check-in at the pitch succeeds: YOU'RE HERE.", async () => {
    const { ctx, page } = await browserAs(browser, me, PLACE);
    await page.goto(`${APP}/activity/${gameB}`, { waitUntil: 'load', timeout: 90_000 });
    await page.getByTestId('check-in-button').click({ timeout: 20_000 });
    await page.waitForURL(/\/check-in$/, { timeout: 15_000 });
    await page.getByTestId('youre-here').waitFor({ timeout: 15_000 });
    assert((await card(me, gameB)).my_attendance === 'checked_in', 'should be checked in');
    // Arrivals update in realtime when the host arrives.
    await host.call('check_in', { p_activity_id: gameB, p_lat: PLACE.lat, p_lng: PLACE.lng, p_idempotency_key: key() });
    await page.getByText('2 of 3 have arrived', { exact: false }).waitFor({ timeout: 15_000 });
    await ctx.close();
  });

  await step('the host starts and ends the game; After opens', async () => {
    await player.call('check_in', { p_activity_id: gameB, p_lat: PLACE.lat, p_lng: PLACE.lng, p_idempotency_key: key() });
    await host.call('start_activity', { p_activity_id: gameB });
    await host.call('end_activity', { p_activity_id: gameB });
    const c = await card(me, gameB);
    assert(c.effective_status === 'after', `expected after, got ${c.effective_status}`);
    const logged = await host.call('propose_result', {
      p_activity_id: gameB,
      p_team_a_score: 5,
      p_team_b_score: 4,
      p_idempotency_key: key(),
    });
    assert(logged.threshold === 2 && logged.confirmations_count === 1, `unexpected threshold state ${JSON.stringify(logged)}`);
  });

  await step('a second player confirms the score in After: Participant confirmed', async () => {
    const { ctx, page } = await browserAs(browser, me);
    await page.goto(`${APP}/activity/${gameB}/after`, { waitUntil: 'load', timeout: 90_000 });
    await page.getByTestId('threshold-line').waitFor({ timeout: 20_000 });
    assert(/1 of 3 confirmed\. At 2/.test(await page.getByTestId('threshold-line').innerText()), 'threshold copy');
    await page.getByTestId('confirm-result').click();
    await page.getByTestId('result-verified').waitFor({ timeout: 15_000 });
    await ctx.close();
  });

  let newPlan;
  await step('the recap shows the result and the Passport stamp; Run It Back opens a new plan', async () => {
    const { ctx, page } = await browserAs(browser, me);
    await page.goto(`${APP}/activity/${gameB}/recap`, { waitUntil: 'load', timeout: 90_000 });
    const headline = page.getByTestId('recap-headline');
    await headline.waitFor({ timeout: 20_000 });
    assert(/LIGHTS WIN/i.test(await headline.innerText()), 'headline should say LIGHTS WIN');
    await page.getByTestId('passport-stamp').waitFor({ timeout: 15_000 });
    await page.getByTestId('recap-run-it-back').click();
    await page.getByTestId('run-it-back-screen').waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'RUN IT BACK', exact: true }).click();
    await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 15_000 });
    newPlan = /\/plan\/([0-9a-f-]{36})/.exec(page.url())[1];
    await ctx.close();
  });

  await step('the new plan has invites, not members (nobody is in until I\'M DOWN)', async () => {
    cleanup.push(() => me.call('cancel_plan', { p_plan_id: newPlan }));
    const { data: plan } = await me.client.from('plan_cards').select('*').eq('id', newPlan).single();
    assert(plan.source === 'run_it_back' && plan.source_activity_id === gameB, 'linked to the game');
    assert(plan.member_count === 0 && plan.i_am_in === false, `members: ${plan.member_count}`);
    for (const person of [host, player]) {
      const { data } = await person.client.from('plan_invites').select('kind,status').eq('plan_id', newPlan).eq('invitee_id', person.id);
      assert(data?.[0]?.kind === 'run_it_back' && data[0].status === 'pending', `${person.name} should have a pending invite`);
    }
    const { data: members } = await me.client.from('plan_members').select('user_id').eq('plan_id', newPlan);
    assert((members ?? []).length === 0, 'no member rows');
  });
} catch (error) {
  exitCode = 1;
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const undo of cleanup.reverse()) {
    try {
      await undo();
    } catch {
      // Already finished or started; nothing left forming.
    }
  }
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} steps passed`);
process.exit(exitCode);
