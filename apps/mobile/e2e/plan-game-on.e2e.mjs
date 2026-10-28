// Slice 01 e2e: Plan → I'M DOWN → realtime gather → GAME ON for everyone at the same moment, against
// the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/plan-game-on.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (E2E_APP_URL, default
// http://localhost:8100) and Playwright. Re-runnable: it uses its own four test users (made with the
// local admin API, phone + password, never the seeded people), creates fresh plans every run, and
// cancels what it left behind so nobody else's screens change.
//
// Checks:
//   1. Three people on a capacity-3 plan: the count ticks in realtime on every screen, a double tap
//      on I'M DOWN joins once, and all three are taken to GAME ON together.
//   2. A fourth person whose screen is behind gets plan_full: "Couldn't join" + JOIN WAITLIST.
//   3. Offline: the last count stays with its time, I'M DOWN queues and goes through on reconnect.
//   4. An expired plan says IT DIDN'T COME TOGETHER and offers STILL ON plans (never dead-ends).
//   5. GAME ON reached while elsewhere shows on Home (no forced takeover there).
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

const APP = process.env.E2E_APP_URL ?? 'http://localhost:8100';
const PASSWORD = 'ojoro-e2e-password';
/** Everyone on the same moment, within this. */
const SAME_MOMENT_MS = 3000;

// ---------------------------------------------------------------------------------------------
// Supabase

function readEnv() {
  let env = {};
  try {
    const out = execSync('npx supabase status -o env', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
      });
    env = Object.fromEntries(out);
  } catch {
    // Fall through to the app's config.
  }
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
  host: { phone: '+15555559921', name: 'Nia E' },
  b: { phone: '+15555559922', name: 'Obi K' },
  c: { phone: '+15555559923', name: 'Ada M' },
  d: { phone: '+15555559924', name: 'Uche P' },
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
    p_sports: [
      { sport_id: 'football', level: 'casual', is_main: true },
      { sport_id: 'volleyball', level: 'casual' },
    ],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_display_name: name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
  return { client, call, session: res.data.session, id: res.data.user.id, name };
}

const key = () => randomUUID();
const inMinutes = (m) => new Date(Math.ceil((Date.now() + m * 60_000) / 60_000) * 60_000).toISOString();

async function placeId(client, name) {
  const { data, error } = await client.from('places').select('id').eq('name', name).single();
  if (error) throw error;
  return data.id;
}

async function planCard(person, id) {
  const { data, error } = await person.client.from('plan_cards').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

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
  // The Expo dev server can take a while to serve the bundle; the checks below keep their own limits.
  ctx.setDefaultNavigationTimeout(120_000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.name}]`, e.message));
  return { ctx, page };
}

/**
 * Go offline or online. NetInfo on Chromium listens to `navigator.connection` 'change' only, which
 * Playwright's setOffline doesn't fire, so fire it too (a real device fires it itself).
 */
async function setOffline(page, offline) {
  await page.context().setOffline(offline);
  await page.evaluate(() => {
    const target = navigator.connection ?? window;
    target.dispatchEvent(new Event(navigator.onLine ? 'online' : 'offline'));
    navigator.connection?.dispatchEvent(new Event('change'));
  });
}

/** Load a path, retrying when the dev server drops the request while it rebuilds. */
async function open(page, path) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** The I'M DOWN commit button (not the I'M DOWN marks in Who's in). */
const imDownButton = (page) => page.getByRole('button', { name: /^I'M DOWN$/i }).first();

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
const toCancel = [];
let exitCode = 0;

try {
  const host = await signIn(PEOPLE.host);
  const b = await signIn(PEOPLE.b);
  const c = await signIn(PEOPLE.c);
  const d = await signIn(PEOPLE.d);
  const jeanneMance = await placeId(host.client, 'Jeanne-Mance Park');
  const jarry = await placeId(host.client, 'Parc Jarry');

  // Start the expired-plan case first: its deadline passes while the other checks run.
  const expiring = await host.call('create_plan', {
    p_idempotency_key: key(),
    p_sport_id: 'volleyball',
    p_starts_at: inMinutes(60),
    p_deadline_at: inMinutes(1.5),
    p_capacity: 8,
    p_place_id: jeanneMance,
  });
  const stillOnTitle = `Beach volleyball ${Date.now() % 100000}`;
  const stillOn = await host.call('create_plan', {
    p_idempotency_key: key(),
    p_sport_id: 'beach_volleyball',
    p_title: stillOnTitle,
    p_starts_at: inMinutes(180),
    p_capacity: 8,
    p_place_id: jarry,
  });
  toCancel.push(stillOn.plan_id);

  // 1. Realtime gather and GAME ON together --------------------------------------------------
  const plan = await host.call('create_plan', {
    p_idempotency_key: key(),
    p_sport_id: 'football',
    p_starts_at: inMinutes(120),
    p_time_options: [inMinutes(150)],
    p_capacity: 3,
    p_place_id: jeanneMance,
    p_meeting_point: 'North pitch, by the lights',
  });
  const planId = plan.plan_id;
  const H = await browserAs(browser, host);
  const B = await browserAs(browser, b);
  const C = await browserAs(browser, c);
  const all = [H, B, C];

  await step('three people open the plan and see 1 / 3', async () => {
    await Promise.all(all.map(({ page }) => open(page, `/plan/${planId}`)));
    await Promise.all(all.map(({ page }) => page.getByText('1 / 3').first().waitFor({ timeout: 60_000 })));
    await H.page.getByTestId('meeting-point').waitFor({ timeout: 10_000 });
    assert((await B.page.getByTestId('meeting-point').count()) === 0, 'non-member sees the meeting point');
    await B.page.getByText('The exact pitch is shared with people in the plan only.').waitFor();
  });

  await step("double-tapping I'M DOWN joins once, and every screen ticks to 2 / 3", async () => {
    await imDownButton(B.page).waitFor();
    await imDownButton(B.page).dblclick();
    await Promise.all(all.map(({ page }) => page.getByText('2 / 3').first().waitFor({ timeout: 10_000 })));
    await B.page.getByRole('button', { name: /YOU'RE DOWN/i }).first().waitFor();
    await new Promise((r) => setTimeout(r, 1500));
    const card = await planCard(host, planId);
    assert(card.member_count === 2, `member_count ${card.member_count} after a double tap`);
    const roster = await host.call('plan_roster', { p_plan_id: planId });
    assert(roster.filter((r) => r.user_id === b.id).length === 1, 'B is in the roster once');
  });

  await step('the last I’M DOWN takes all three to GAME ON at the same moment', async () => {
    const reached = all.map(({ page }) =>
      page.waitForURL(/\/plan\/[^/]+\/game-on/, { timeout: 15_000, waitUntil: 'commit' }).then(() => Date.now()),
    );
    await imDownButton(C.page).click();
    const times = await Promise.all(reached);
    const spread = Math.max(...times) - Math.min(...times);
    console.log(`     GAME ON reached on 3 screens within ${spread} ms`);
    assert(spread <= SAME_MOMENT_MS, `GAME ON spread ${spread} ms`);
    await Promise.all(all.map(({ page }) => page.getByTestId('game-on').waitFor()));
    await C.page.getByText('JUST NOW · YOU MADE IT 3').waitFor({ timeout: 10_000 });
    await H.page.getByText(`JUST NOW · ${PEOPLE.c.name.split(' ')[0].toUpperCase()} MADE IT 3`).waitFor();
    await H.page.getByText('All 3 got this at the same moment.', { exact: false }).waitFor();
    const card = await planCard(host, planId);
    assert(card.effective_status === 'game_on' && card.activity_id, 'server says game_on with an activity');
  });

  await step('GAME ON reached elsewhere shows on Home, without a takeover', async () => {
    // In the app: close the takeover, then back from the plan (opened directly) lands on Home.
    await H.page.getByRole('button', { name: 'Close' }).click();
    await H.page.getByTestId('plan-screen').waitFor({ timeout: 15_000 });
    await H.page.getByRole('button', { name: 'Back' }).first().click();
    await H.page.getByText('YOUR PLANS').waitFor({ timeout: 60_000 });
    await H.page.getByText('3 / 3').first().waitFor();
    assert(!/game-on/.test(H.page.url()), 'Home took over');
  });

  // 2. Couldn't join: a fourth person whose screen is behind ---------------------------------
  const D = await browserAs(browser, d);
  await step("a fourth person gets plan_full: Couldn't join + JOIN WAITLIST", async () => {
    const small = await host.call('create_plan', {
      p_idempotency_key: key(),
      p_sport_id: 'football',
      p_starts_at: inMinutes(150),
      p_capacity: 2,
      p_place_id: jeanneMance,
    });
    // D's screen misses the realtime update, so the tap reaches a plan that just filled.
    await D.page.routeWebSocket(/realtime/, (ws) => ws.close());
    await open(D.page, `/plan/${small.plan_id}`);
    await D.page.getByText('1 / 2').first().waitFor({ timeout: 60_000 });
    await b.call('im_down', { p_plan_id: small.plan_id, p_idempotency_key: key() });
    await imDownButton(D.page).click();
    await D.page.getByText("Couldn't join. The last spot went a moment before you.").waitFor({ timeout: 10_000 });
    await D.page.getByTestId('join-waitlist').click();
    await D.page.getByTestId('waitlisted').waitFor({ timeout: 10_000 });
    const card = await planCard(host, small.plan_id);
    const { data: att } = await d.client.from('activity_cards').select('my_attendance').eq('id', card.activity_id).single();
    assert(att.my_attendance === 'waitlisted', `attendance ${att.my_attendance}`);
    await D.page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  // 3. Offline -----------------------------------------------------------------------------
  await step("offline keeps the last count with its time; I'M DOWN queues and lands on reconnect", async () => {
    const page = (await browserAs(browser, d)).page;
    await open(page, `/plan/${stillOn.plan_id}`);
    await page.getByText('1 / 8').first().waitFor({ timeout: 60_000 });
    await setOffline(page, true);
    await page.getByTestId('offline-banner').waitFor({ timeout: 10_000 });
    await page.getByText(/Count as of \d{1,2}:\d{2} (AM|PM)/).waitFor();
    await imDownButton(page).click();
    await page.getByText("Offline. Your I'M DOWN goes through when you're back.").first().waitFor({ timeout: 10_000 });
    assert((await planCard(host, stillOn.plan_id)).member_count === 1, 'joined while offline');
    await setOffline(page, false);
    await page.getByText('2 / 8').first().waitFor({ timeout: 15_000 });
    await new Promise((r) => setTimeout(r, 1000));
    assert((await planCard(host, stillOn.plan_id)).member_count === 2, 'queued I’M DOWN did not land once');
    await d.call('leave_plan', { p_plan_id: stillOn.plan_id, p_idempotency_key: key() });
    await page.context().close();
  });

  // 4. Expired ------------------------------------------------------------------------------
  await step('an expired plan offers STILL ON plans and TRY AGAIN THIS WEEKEND', async () => {
    const wait = Date.parse((await planCard(host, expiring.plan_id)).deadline_at) - Date.now() + 1500;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await open(D.page, `/plan/${expiring.plan_id}`);
    await D.page.getByText("IT DIDN'T COME TOGETHER.").waitFor({ timeout: 60_000 });
    await D.page.getByText('1 of 8 by the deadline. Nobody was charged or marked as a no-show.').waitFor();
    await D.page.getByTestId('still-on').getByText(stillOnTitle).waitFor({ timeout: 10_000 });
    await D.page.getByTestId('try-again').waitFor();
    assert((await imDownButton(D.page).count()) === 0, "an expired plan still offers I'M DOWN");
  });

  // Tidy up: GAME ON games are called off; what's still forming is cancelled.
  for (const id of [planId]) {
    const card = await planCard(host, id);
    if (card.activity_id) await host.call('cancel_activity', { p_activity_id: card.activity_id }).catch(() => {});
  }
} catch (error) {
  exitCode = 1;
  if (!results.some((r) => !r.ok)) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const id of toCancel) {
    try {
      const host = await signIn(PEOPLE.host);
      await host.call('cancel_plan', { p_plan_id: id });
    } catch {
      // Already over.
    }
  }
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (results.some((r) => !r.ok)) exitCode = 1;
  process.exit(exitCode);
}
