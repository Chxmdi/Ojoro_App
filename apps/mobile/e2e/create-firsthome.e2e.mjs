#!/usr/bin/env node
/**
 * Step 3 e2e: the area step in onboarding, FirstHome (latent demand, further out), Create (Tell
 * Ojoro, Quick Plan) and the reworked Pull Someone In list.
 *
 * Runs against the local app (Expo web) and the local Supabase stack:
 *
 *   npx supabase start
 *   pnpm --filter @ojoro/mobile web
 *   E2E_APP_URL=http://localhost:8100 node apps/mobile/e2e/create-firsthome.e2e.mjs
 *
 * Re-runnable. It refreshes the Step 3 sample data (`supabase/seed_liquidity.sql`, idempotent) at
 * the start and again at the end, so the runners' demand near Nneka is back for everyone else.
 * Its own people (code-free password sign-in, created on first run):
 *   +1 555 555 9810  a brand-new user, deleted and recreated each run (onboarding, Tell Ojoro)
 *   +1 555 555 9811  Lina R, Plateau: makes a Quick Plan (left, so cancelled, at the end)
 *   +1 555 555 9812  Sade M, Saint-Henri runner: I'M DOWN on the runners' demand
 * Read-only for seeded people: Nneka B (+1 555 555 0120) and Chimdi O (+1 555 555 0100).
 *
 * Env: E2E_APP_URL (default http://localhost:8100), E2E_DB_URL (default the local Postgres),
 * E2E_SHOTS (a folder for a failure screenshot).
 */
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

const APP = (process.env.E2E_APP_URL ?? 'http://localhost:8100').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PASSWORD = 'ojoro-e2e-password';
const T = 30_000;

const NNEKA = { id: 'a0000000-0000-4000-8000-000000000020', phone: '+15555550120' };
const CHIMDI = { id: 'a0000000-0000-4000-8000-000000000001', phone: '+15555550100' };
const RUNNERS = [
  'a0000000-0000-4000-8000-000000000021',
  'a0000000-0000-4000-8000-000000000022',
  'a0000000-0000-4000-8000-000000000023',
];
const NEW_USER = { phone: '+15555559810', name: 'Kofi A' };
const MAKER = { phone: '+15555559811', name: 'Lina R' };
const RUNNER = { phone: '+15555559812', name: 'Sade M' };

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

function refreshSeed() {
  execSync(`psql "${DB_URL}" -q -v ON_ERROR_STOP=1 -f supabase/seed_liquidity.sql`, {
    cwd: root,
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function caller(client, name) {
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
}

/** Password sign-in for our own people, creating them on the first run. */
async function signInOwn({ phone, name }, { fresh = false } = {}) {
  if (fresh) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data.users.filter((x) => x.phone === phone.slice(1))) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`delete ${name}: ${error.message}`);
    }
  }
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
  return { client, call: caller(client, name), session: res.data.session, id: res.data.user.id, name };
}

/** Seeded people sign in with the test code (supabase/config.toml). */
async function signInSeeded(phone, name) {
  const client = createClient(URL_, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.verifyOtp({ phone, token: '123456', type: 'sms' });
  if (error) throw new Error(`sign in ${name}: ${error.message}`);
  return { client, call: caller(client, name), session: data.session, id: data.user.id, name };
}

/** Out of every forming plan (the last one out cancels it) and no active Down For. */
async function startClean(person) {
  const { data: forming } = await person.client
    .from('plan_cards')
    .select('id')
    .eq('i_am_in', true)
    .eq('effective_status', 'forming');
  for (const p of forming ?? []) await person.call('leave_plan', { p_plan_id: p.id, p_idempotency_key: randomUUID() });
  const { data: signals } = await person.client
    .from('intent_signals')
    .select('id')
    .eq('user_id', person.id)
    .eq('status', 'active');
  for (const s of signals ?? []) await person.call('withdraw_down_for', { p_signal_id: s.id });
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
  ctx.setDefaultNavigationTimeout(120_000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.name}]`, e.message));
  return { ctx, page };
}

async function open(page, path) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}${path}`, { waitUntil: 'load' });
      return;
    } catch (error) {
      // The dev server restarts itself if Metro dies; give it time.
      if (attempt >= 6) throw error;
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`).first();
async function waitPath(page, want) {
  await page.waitForFunction(
    (w) => (w.startsWith('^') ? new RegExp(w).test(window.location.pathname) : window.location.pathname === w),
    want,
    { timeout: T },
  );
}

const results = [];
let current = null;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}\n     ${String(error?.message ?? error).split('\n')[0]}`);
    if (current) {
      console.log(`     at ${current.url()}`);
      if (process.env.E2E_SHOTS) {
        await current.screenshot({ path: join(process.env.E2E_SHOTS, 'e2e-failure.png') }).catch(() => {});
      }
    }
    throw error;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
let exitCode = 0;
let maker = null;

try {
  refreshSeed();

  const fresh = await signInOwn(NEW_USER, { fresh: true });
  maker = await signInOwn(MAKER);
  const runner = await signInOwn(RUNNER);
  const nneka = await signInSeeded(NNEKA.phone, 'Nneka');
  const chimdi = await signInSeeded(CHIMDI.phone, 'Chimdi');

  await maker.call('save_onboarding', {
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 3,
    p_display_name: MAKER.name,
  });
  await maker.call('set_area', { p_area: 'Plateau, Montréal' });
  await startClean(maker);

  await runner.call('save_onboarding', {
    p_sports: [{ sport_id: 'running', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 3,
    p_display_name: RUNNER.name,
  });
  await runner.call('set_area', { p_area: 'Saint-Henri, Montréal' });
  await startClean(runner);
  // The demand rate limit counts plans formed from signals in 24 h: earlier runs don't count.
  await admin
    .from('plans')
    .update({ created_at: new Date(Date.now() - 25 * 3600_000).toISOString() })
    .eq('created_by', runner.id)
    .eq('source', 'down_for');

  // 1. Onboarding with the area step ---------------------------------------------------------
  const N = await browserAs(browser, fresh);
  current = N.page;
  await step('a new user sets an area in onboarding (list, search, privacy line)', async () => {
    const page = N.page;
    await open(page, '/');
    await waitPath(page, '/sports');
    await byTestId(page, 'sport-running').click();
    await byTestId(page, 'level-running-casual').click();
    await byTestId(page, 'sports-continue').click();
    await waitPath(page, '/when');
    await byTestId(page, 'when-continue').click();
    await waitPath(page, '/area');
    await page.getByText('An area, never an address.', { exact: false }).first().waitFor({ timeout: T });
    await byTestId(page, 'area-search').fill('montreal plat');
    await byTestId(page, 'area-Plateau').click();
    await byTestId(page, 'area-save').click();
    await waitPath(page, '/privacy');
    await byTestId(page, 'onboarding-lets-move').click();
    await waitPath(page, '/');
    const { data: profile } = await admin.from('profiles').select('area, onboarding_completed_at').eq('id', fresh.id).single();
    const { data: point } = await admin.from('profile_private').select('area_lat, area_lng').eq('user_id', fresh.id).single();
    assert(profile.area === 'Plateau, Montréal' && profile.onboarding_completed_at, `area ${profile.area}`);
    assert(point.area_lat === 45.52 && point.area_lng === -73.58, 'the point is the neighbourhood centroid');
  });

  // 2. Tell Ojoro suggests, joins nothing ---------------------------------------------------
  await step("Create's Tell Ojoro returns a best match with a WHY and joins nothing until confirmed", async () => {
    const page = N.page;
    await open(page, '/create');
    await byTestId(page, 'tell-ojoro').fill('I have 90 minutes and want to meet people.');
    await byTestId(page, 'best-match').waitFor({ timeout: T });
    const text = await byTestId(page, 'best-match').innerText();
    assert(/BEST MATCH/.test(text) && /Why: /.test(text), `best match: ${text}`);
    await page.getByText('Nothing is sent or joined until you confirm.').first().waitFor();
    await page.waitForTimeout(1500);
    const { count: members } = await admin
      .from('plan_members')
      .select('plan_id', { count: 'exact', head: true })
      .eq('user_id', fresh.id);
    const { count: signals } = await admin
      .from('intent_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', fresh.id);
    assert(members === 0 && signals === 0, `joined ${members} plans, ${signals} signals before confirming`);
  });
  await N.ctx.close();

  // 3. Quick Plan ------------------------------------------------------------------------------
  const M = await browserAs(browser, maker);
  current = M.page;
  await step('Quick Plan validates in words, creates a plan and opens it', async () => {
    const page = M.page;
    await open(page, '/create');
    await byTestId(page, 'create-quick-plan').click();
    await waitPath(page, '/create/plan');
    await byTestId(page, 'plan-form-submit').click();
    await page.getByText('Pick a sport.').waitFor({ timeout: T });
    await page.getByText('Pick where you will play.').waitFor();
    const { data: jm } = await admin.from('places').select('id').eq('name', 'Jeanne-Mance Park').single();
    await byTestId(page, 'sport-football').click();
    await byTestId(page, 'day-1').click();
    await byTestId(page, 'time-1170').click();
    await byTestId(page, `place-${jm.id}`).click();
    await byTestId(page, 'meeting-point').fill('North pitch, by the lights');
    await byTestId(page, 'plan-form-submit').dblclick();
    await waitPath(page, '^/plan/[0-9a-f-]{36}$');
    const id = new URL(page.url()).pathname.split('/')[2];
    const { data: plans } = await admin
      .from('plans')
      .select('id, sport_id, place_id, capacity, host_id, member_count, starts_at')
      .eq('created_by', maker.id)
      .eq('status', 'forming');
    assert(plans.length === 1 && plans[0].id === id, `${plans.length} forming plans by the maker`);
    const p = plans[0];
    assert(p.sport_id === 'football' && p.place_id === jm.id && p.host_id === maker.id && p.member_count === 1, 'plan fields');
    const local = new Date(p.starts_at).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: false });
    assert(local === '19:30', `starts at ${local}`);
    const { data: meet } = await admin.from('plan_meeting_points').select('label').eq('plan_id', id).single();
    assert(meet.label === 'North pitch, by the lights', 'meeting point');
    await page.getByTestId('plan-screen').waitFor({ timeout: T });
  });
  await M.ctx.close();

  // 4–5. FirstHome for Nneka (read-only) -----------------------------------------------------
  const K = await browserAs(browser, nneka);
  current = K.page;
  await step("Nneka sees FirstHome with the runners' demand count and no names", async () => {
    const page = K.page;
    await open(page, '/');
    await byTestId(page, 'first-home').waitFor({ timeout: T });
    const day = await byTestId(page, 'first-home-day').innerText();
    assert(/^DAY \d+ · SAINT-HENRI$/.test(day.trim()), `overline ${day}`);
    await page.getByText('QUIET HERE.', { exact: false }).first().waitFor();
    const band = await byTestId(page, 'first-home-demand').innerText();
    assert(/3 people nearby are down for running/.test(band) && /becomes a plan at 4/.test(band), `band: ${band}`);
    const body = await byTestId(page, 'first-home-body').innerText();
    assert(/3 people within 3 km want to run/.test(body), `body: ${body}`);
    const { data: names } = await admin.from('profiles').select('display_name').in('id', RUNNERS);
    const all = await page.locator('body').innerText();
    for (const { display_name } of names) assert(!all.includes(display_name), `${display_name} is named on FirstHome`);
    await byTestId(page, 'quick-down-for').waitFor();
    await byTestId(page, 'feed-end').waitFor();
  });

  await step('further-out items open plans', async () => {
    const page = K.page;
    const rows = await nneka.call('further_out', { p_limit: 5 });
    const plan = rows.find((r) => r.kind === 'plan');
    assert(plan, 'no further-out plan in the sample data');
    await byTestId(page, 'further-out').waitFor({ timeout: T });
    await byTestId(page, 'further-out').getByText(plan.title ?? plan.sport_name, { exact: true }).first().click();
    await waitPath(page, `/plan/${plan.plan_id}`);
    await page.getByTestId('plan-screen').waitFor({ timeout: T });
  });
  await K.ctx.close();

  // 6. I'M DOWN on the demand, once ---------------------------------------------------------
  const R = await browserAs(browser, runner);
  current = R.page;
  await step("I'M DOWN on demand forms a plan exactly once, even double-tapped", async () => {
    const page = R.page;
    const since = new Date().toISOString();
    await open(page, '/');
    await byTestId(page, 'first-home-demand').waitFor({ timeout: T });
    await byTestId(page, 'first-home-demand').getByRole('button', { name: /I'M DOWN/i }).dblclick();
    await waitPath(page, '^/plan/[0-9a-f-]{36}$');
    const id = new URL(page.url()).pathname.split('/')[2];
    const { data: made } = await admin
      .from('plans')
      .select('id, member_count, source')
      .eq('created_by', runner.id)
      .gte('created_at', since);
    assert(made.length === 1 && made[0].id === id && made[0].source === 'down_for', `${made.length} plans formed`);
    const { data: members } = await admin.from('plan_members').select('user_id').eq('plan_id', id);
    const ids = members.map((m) => m.user_id);
    assert(ids.filter((u) => u === runner.id).length === 1, 'the runner is in once');
    assert(RUNNERS.every((u) => ids.includes(u)) && made[0].member_count === 4, `members ${ids.length}`);
  });
  await R.ctx.close();

  // 7. Pull Someone In: tiers and reasons ---------------------------------------------------
  const C = await browserAs(browser, chimdi);
  current = C.page;
  await step('the Pull Someone In list shows tiers and reasons from the ranking', async () => {
    const page = C.page;
    const { data: plans } = await chimdi.client
      .from('plan_cards')
      .select('id')
      .eq('i_am_in', true)
      .eq('effective_status', 'forming')
      .eq('sport_id', 'football')
      .order('starts_at')
      .limit(1);
    assert(plans?.length === 1, 'Chimdi has no forming football plan');
    const ranked = await chimdi.call('pull_in_candidates', { p_plan_id: plans[0].id });
    assert(ranked.length > 0, 'no candidates');
    await open(page, `/plan/${plans[0].id}/pull-in`);
    await page.getByText('Ranked by who', { exact: false }).first().waitFor({ timeout: T });
    for (const c of ranked.slice(0, 3)) {
      await byTestId(page, `candidate-${c.tier}-${c.user_id}`).waitFor({ timeout: T });
      const reason = (await byTestId(page, `reason-${c.user_id}`).innerText()).trim();
      assert(reason === c.reason, `${c.display_name}: "${reason}" vs "${c.reason}"`);
    }
    const order = await page.locator('[data-testid^="candidate-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid').split('-').slice(-5).join('-')),
    );
    assert(order.slice(0, 3).join() === ranked.slice(0, 3).map((c) => c.user_id).join(), 'rows keep the server order');
  });
  await C.ctx.close();
} catch (error) {
  exitCode = 1;
  if (!results.some((r) => !r.ok)) console.log(`FAIL setup\n     ${error.message}`);
} finally {
  try {
    if (maker) await startClean(maker);
    refreshSeed();
  } catch (error) {
    console.log(`  cleanup: ${error.message}`);
  }
  await browser.close();
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed`);
process.exit(exitCode);
