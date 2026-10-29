#!/usr/bin/env node
/**
 * Step 4 e2e: Updates (notifications), the bell, the Home action feed and Settings → Notifications.
 *
 * Runs against the local app (Expo web) and the local Supabase stack:
 *
 *   npx supabase start
 *   pnpm --filter @ojoro/mobile web
 *   E2E_APP_URL=http://localhost:8100 node apps/mobile/e2e/updates-home.e2e.mjs
 *
 * Re-runnable. Its own people (code-free password sign-in, created on first run), all in Plateau:
 *   +1 555 555 9820  Ife H, hosts the plans
 *   +1 555 555 9821  Tobi V, the person whose Updates and Home we watch (Pull Me In for football)
 *   +1 555 555 9822  Kemi X, joins plans so they need one more
 *   +1 555 555 9823  Remi B, blocked by Tobi; their plan must never show
 * At the start everyone leaves their forming plans, Tobi's notifications and settings are cleared
 * and the block is lifted; at the end the plans are left again and the settings put back.
 *
 * Env: E2E_APP_URL (default http://localhost:8100), E2E_SHOTS (a folder for a failure screenshot).
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
const PASSWORD = 'ojoro-e2e-password';
const T = 30_000;

const HOST = { phone: '+15555559820', name: 'Ife H' };
const VIEWER = { phone: '+15555559821', name: 'Tobi V' };
const JOINER = { phone: '+15555559822', name: 'Kemi X' };
const BLOCKED = { phone: '+15555559823', name: 'Remi B' };
const BLOCKED_TITLE = 'Remi run club';

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
const key = () => randomUUID();
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();

function caller(client, name) {
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
}

/** Password sign-in for our own people, creating them on the first run. */
async function signInOwn({ phone, name }) {
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

async function setUp(person) {
  await person.call('save_onboarding', {
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 3,
    p_display_name: person.name,
  });
  await person.call('set_area', { p_area: 'Plateau, Montréal' });
}

/** Out of every forming plan (the last one out cancels it) and no active Down For. */
async function startClean(person) {
  const { data: forming } = await person.client
    .from('plan_cards')
    .select('id')
    .eq('i_am_in', true)
    .eq('effective_status', 'forming');
  for (const p of forming ?? []) await person.call('leave_plan', { p_plan_id: p.id, p_idempotency_key: key() });
  const { data: signals } = await person.client
    .from('intent_signals')
    .select('id')
    .eq('user_id', person.id)
    .eq('status', 'active');
  for (const s of signals ?? []) await person.call('withdraw_down_for', { p_signal_id: s.id });
}

async function clearNotifications(person) {
  for (const table of ['notifications']) {
    const { error } = await admin.from(table).delete().eq('recipient_id', person.id);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
  for (const table of ['notification_preferences', 'notification_settings', 'notification_mutes']) {
    const { error } = await admin.from(table).delete().eq('user_id', person.id);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
}

async function placeId(client, name) {
  const { data, error } = await client.from('places').select('id').eq('name', name).single();
  if (error) throw new Error(`place ${name}: ${error.message}`);
  return data.id;
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

async function setOffline(page, offline) {
  await page.context().setOffline(offline);
  await page.evaluate(() => {
    const target = navigator.connection ?? window;
    target.dispatchEvent(new Event(navigator.onLine ? 'online' : 'offline'));
    navigator.connection?.dispatchEvent(new Event('change'));
  });
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

async function until(fn, message, timeout = T) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(message);
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
let exitCode = 0;
const people = [];

try {
  const host = await signInOwn(HOST);
  const viewer = await signInOwn(VIEWER);
  const joiner = await signInOwn(JOINER);
  const blocked = await signInOwn(BLOCKED);
  people.push(host, viewer, joiner, blocked);
  for (const p of people) {
    await setUp(p);
    await startClean(p);
  }
  await viewer.call('set_pull_me_in', { p_sport_id: 'football', p_enabled: true, p_scope: 'nearby' });
  await viewer.client.rpc('unblock_user', { p_user_id: blocked.id });
  await clearNotifications(viewer);

  const jeanneMance = await placeId(host.client, 'Jeanne-Mance Park');
  const plan = (minutes, capacity, by = host, title = undefined) =>
    by.call('create_plan', {
      p_idempotency_key: key(),
      p_sport_id: 'football',
      p_starts_at: inMinutes(minutes),
      p_capacity: capacity,
      p_place_id: jeanneMance,
      ...(title ? { p_title: title } : null),
    });

  // Enough joinable plans near Tobi that Home is the Main feed, not FirstHome.
  await plan(26 * 60, 8);
  await plan(27 * 60, 8);
  const density = (await viewer.call('home_density', {}))[0];
  assert(!density.low_density, `Tobi's Home would be FirstHome (${density.plans_near} plans near)`);

  const notificationFor = async (planId, type = 'need_one_more') => {
    const rows = await viewer.call('my_notifications', { p_limit: 50 });
    return rows.find((r) => r.plan_id === planId && r.type === type) ?? null;
  };

  const V = await browserAs(browser, viewer);
  current = V.page;
  let first = null;
  let firstRow = null;

  // 1. The bell -----------------------------------------------------------------------------
  await step('a plan needing one more lights the bell with the unread count, live', async () => {
    const page = V.page;
    await open(page, '/');
    await byTestId(page, 'home-feed').waitFor({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Updates', exact: true }).waitFor({ timeout: T });
    first = await plan(180, 3);
    await joiner.call('im_down', { p_plan_id: first.plan_id, p_idempotency_key: key() });
    firstRow = await until(() => notificationFor(first.plan_id), 'no need_one_more for Tobi');
    const unread = await viewer.call('unread_count', {});
    assert(unread >= 1, `unread ${unread}`);
    await page.getByRole('button', { name: `Updates, ${unread} new` }).waitFor({ timeout: T });
  });

  await step('the bell opens Updates, the row is under NEEDS YOU, and the count clears', async () => {
    const page = V.page;
    await page.getByRole('button', { name: /^Updates, \d+ new$/ }).click();
    await waitPath(page, '/updates');
    const group = byTestId(page, 'group-needs-you');
    await group.waitFor({ timeout: T });
    await byTestId(group, `update-${firstRow.id}`).getByText(firstRow.title).waitFor();
    await until(async () => (await viewer.call('unread_count', {})) === 0, 'still unread after opening Updates');
    await page.getByRole('button', { name: 'Back' }).last().click();
    await waitPath(page, '/');
    await page.getByRole('button', { name: 'Updates', exact: true }).waitFor({ timeout: T });
  });

  // 2. Realtime on Updates -------------------------------------------------------------------
  let second = null;
  let secondRow = null;
  await step('a new plan event appears in Updates without a reload', async () => {
    const page = V.page;
    await open(page, '/updates');
    await byTestId(page, 'updates-end').waitFor({ timeout: 90_000 });
    second = await plan(200, 3);
    await joiner.call('im_down', { p_plan_id: second.plan_id, p_idempotency_key: key() });
    secondRow = await until(() => notificationFor(second.plan_id), 'no second need_one_more');
    await byTestId(page, `update-${secondRow.id}`).waitFor({ timeout: T });
    assert(
      (await byTestId(page, 'group-needs-you').locator(`[data-testid="update-${secondRow.id}"]`).count()) === 1,
      'the new row is not under NEEDS YOU',
    );
  });

  // 3. Inline action ---------------------------------------------------------------------------
  await step("I'M DOWN on the new need-one-more row joins once on a double tap and leaves NEEDS YOU", async () => {
    const page = V.page;
    const row = byTestId(page, `update-${secondRow.id}`);
    await row.getByRole('button', { name: /^I'm down/i }).dblclick();
    await page.getByText("You're in.").first().waitFor({ timeout: T });
    assert(new URL(page.url()).pathname === '/updates', `the double tap opened ${page.url()}`);
    const { data: members } = await admin.from('plan_members').select('user_id').eq('plan_id', second.plan_id);
    assert(members.filter((m) => m.user_id === viewer.id).length === 1, 'Tobi is not in exactly once');
    const { data: p } = await admin.from('plans').select('member_count, status').eq('id', second.plan_id).single();
    assert(p.member_count === 3, `member_count ${p.member_count}`);
    await until(
      async () => (await byTestId(page, 'group-needs-you').locator(`[data-testid="update-${secondRow.id}"]`).count()) === 0,
      'the row is still under NEEDS YOU',
    );
    const { data: n } = await admin.from('notifications').select('acted_at').eq('id', secondRow.id).single();
    assert(n.acted_at, 'act_on_notification was not called');
  });

  // 4. Deep link and back -----------------------------------------------------------------------
  await step('a row opens its plan, and back returns to Updates', async () => {
    const page = V.page;
    await byTestId(page, `update-${firstRow.id}`).getByText(firstRow.title).first().click();
    await waitPath(page, `/plan/${first.plan_id}`);
    await byTestId(page, 'plan-screen').waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Back' }).last().click();
    await waitPath(page, '/updates');
    await byTestId(page, `update-${firstRow.id}`).waitFor({ timeout: T });
  });

  // 5. Offline -----------------------------------------------------------------------------------
  await step('offline keeps the last list and says how old it is', async () => {
    const page = V.page;
    await setOffline(page, true);
    await byTestId(page, 'offline-banner').waitFor({ timeout: 10_000 });
    await page.getByText(/Offline\. Showing updates from \d{1,2}:\d{2}\./).waitFor();
    await byTestId(page, `update-${firstRow.id}`).waitFor();
    await setOffline(page, false);
    await byTestId(page, 'offline-banner').waitFor({ state: 'detached', timeout: 15_000 });
  });

  // 6. Blocks --------------------------------------------------------------------------------------
  await step("a blocked person's plan never shows in Updates or on Home", async () => {
    const page = V.page;
    await viewer.call('block_user', { p_user_id: blocked.id });
    const theirs = await plan(150, 2, blocked, BLOCKED_TITLE);
    const { data: exists } = await admin.from('plans').select('id, status').eq('id', theirs.plan_id).single();
    assert(exists.status === 'forming', 'the blocked plan was not made');
    // A fresh row lands for something else so we know Updates has refreshed since.
    const third = await plan(210, 3);
    await joiner.call('im_down', { p_plan_id: third.plan_id, p_idempotency_key: key() });
    const thirdRow = await until(() => notificationFor(third.plan_id), 'no third need_one_more');
    await byTestId(page, `update-${thirdRow.id}`).waitFor({ timeout: T });
    const rows = await viewer.call('my_notifications', { p_limit: 50 });
    assert(!rows.some((r) => r.plan_id === theirs.plan_id), 'a notification about the blocked plan');
    const text = await byTestId(page, 'updates').innerText();
    assert(!text.includes(BLOCKED.name) && !text.includes(BLOCKED_TITLE), 'Updates names the blocked person');
    const feed = await viewer.call('home_feed', {});
    assert(!feed.some((c) => c.plan_id === theirs.plan_id), 'home_feed has the blocked plan');
    await open(page, '/');
    await byTestId(page, 'feed-end').waitFor({ timeout: 90_000 });
    const home = await byTestId(page, 'home-feed').innerText();
    assert(!home.includes(BLOCKED.name) && !home.includes(BLOCKED_TITLE), 'Home shows the blocked plan');
    assert((await byTestId(page, `see-plan-${theirs.plan_id}`).count()) === 0, 'Home links the blocked plan');
  });

  // 7. Home feed -----------------------------------------------------------------------------------
  await step('Home shows the feed cards in rank order and ends caught up', async () => {
    const page = V.page;
    await open(page, '/');
    await byTestId(page, 'feed-end').waitFor({ timeout: 90_000 });
    // The server's ranking can move while plans form; compare a fresh read with what's drawn.
    let last = '';
    await until(async () => {
      const feed = await viewer.call('home_feed', {});
      const shown = feed.filter((c) => !['caught_up', 'down_for'].includes(c.card));
      assert(feed[feed.length - 1].card === 'caught_up', 'the feed does not end with caught_up');
      const order = await page.locator('[data-testid^="feed-card-"]').evaluateAll((els) =>
        els.map((e) => Number(e.getAttribute('data-testid').replace('feed-card-', ''))),
      );
      const want = shown.map((c) => c.position);
      last = `drawn ${order} vs ranked ${want}`;
      if (shown.length >= 2 && JSON.stringify(order) === JSON.stringify(want)) return true;
      await open(page, '/');
      await byTestId(page, 'feed-end').waitFor({ timeout: 90_000 });
      return false;
    }, 'feed order').catch(() => {
      throw new Error(last);
    });
    const end = await byTestId(page, 'feed-end').innerText();
    assert(/YOU'RE CAUGHT UP\./.test(end) && /Go do something\./.test(end), `end: ${end}`);
  });

  // 8. Settings ------------------------------------------------------------------------------------
  await step('quiet hours and a type switch save in Settings → Notifications', async () => {
    const page = V.page;
    await open(page, '/updates');
    await byTestId(page, 'updates-settings').click();
    await waitPath(page, '/settings/notifications');
    await page.getByText('Quiet hours 11 PM to 7 AM', { exact: false }).count(); // the caption is on Updates
    await byTestId(page, 'quiet-start-22:00').click();
    await page.getByRole('switch', { name: 'Crew polls' }).click();
    const prefs = await until(async () => {
      const p = await viewer.call('notification_preferences', {});
      return p.quiet_start?.startsWith('22:00') && (p.push_off ?? []).includes('crew_poll') ? p : null;
    }, 'settings did not save');
    assert(prefs.quiet_end.startsWith('07:00'), `quiet_end ${prefs.quiet_end}`);
    await page.getByRole('button', { name: 'Back' }).last().click();
    await waitPath(page, '/updates');
    await page.getByText('Quiet hours 10 PM to 7 AM.', { exact: false }).waitFor({ timeout: T });
  });
} catch (error) {
  exitCode = 1;
  if (!results.some((r) => !r.ok)) console.log('FAIL setup\n    ', error?.message ?? error);
} finally {
  try {
    const viewer = people[1];
    if (viewer) {
      await viewer.client.rpc('unblock_user', { p_user_id: people[3].id });
      await clearNotifications(viewer);
    }
    for (const p of people) await startClean(p);
  } catch (error) {
    console.log('cleanup:', error?.message ?? error);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(exitCode || (failed ? 1 : 0));
