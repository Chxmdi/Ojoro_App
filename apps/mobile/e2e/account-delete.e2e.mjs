// Polish e2e: deleting your own account (docs/TRUST_CONTRACT.md, "Deleting your own account").
//
//   node apps/mobile/e2e/account-delete.e2e.mjs
//
// A throwaway person (+1 555 555 9951, made fresh with the local admin API every run, never a seeded
// person) hosts a finished game with a partner (+1 555 555 9952) and starts a clan the partner joins.
// The throwaway then goes You → menu → Account → Delete account, reads what goes and what stays, types
// DELETE and confirms in the Expo web app. Checked: they're signed out, the Auth user is gone, the game,
// its attendance and the clan stay with "Former member" in their place, the partner still has them,
// one audit row with no id in it, and the function is idempotent and refuses a call without DELETE. A
// second throwaway (+1 555 555 9956) is paused and deletes itself from the paused screen.
// Needs: the local stack + `supabase functions serve`, the Expo web dev server (APP_URL, default
// http://localhost:8100), psql and Playwright. Nothing depends on the time of day.
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
const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PASSWORD = 'ojoro-e2e-password';
const FORMER = 'f0000000-0000-4000-8000-000000000000';

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

function sql(query) {
  return execSync(`psql "${DB_URL}" -At -v ON_ERROR_STOP=1`, { input: query, stdio: ['pipe', 'pipe', 'inherit'] })
    .toString()
    .trim();
}

async function signIn({ phone, name }, { fresh = false } = {}) {
  if (fresh) sql(`delete from auth.users where phone = '${phone.replace('+', '')}';`);
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

async function until(what, fn, timeout = 20_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${what}`);
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
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 90_000 });
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
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/* global fetch */
async function callFunction(jwt, body) {
  const r = await fetch(`${URL_}/functions/v1/account-delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: env.PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const gone = await signIn({ phone: '+15555559951', name: 'Dele T' }, { fresh: true });
const partner = await signIn({ phone: '+15555559952', name: 'Ifeoma P' });

// Shared history: a finished game the throwaway hosted and both played, and their clan the partner joined.
const activityId = sql(`
with p as (
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values ('football', now() - interval '7 days', 90, (select id from public.places order by slug limit 1), 2, 'public',
          now() - interval '7 days 1 hour', 'game_on', 'quick', '${gone.id}', '${gone.id}', 2)
  returning id
), m as (
  insert into public.plan_members (plan_id, user_id, via)
  select p.id, x.u, x.via from p, (values ('${gone.id}'::uuid, 'host'::public.member_via), ('${partner.id}'::uuid, 'im_down'::public.member_via)) x(u, via)
), a as (
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status, after_closes_at)
  select p.id, 'football', now() - interval '7 days', now() - interval '7 days' + interval '90 minutes',
         (select id from public.places order by slug limit 1), 2, '${gone.id}', 2, 2, 'check_in',
         now() - interval '7 days 30 minutes', now() - interval '7 days' + interval '90 minutes', 'complete', now() - interval '6 days'
  from p returning id
), att as (
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select a.id, x.u, 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location'
  from a, (values ('${gone.id}'::uuid), ('${partner.id}'::uuid)) x(u)
)
select id from a;`);
const clan = await gone.call('create_clan', { p_idempotency_key: randomUUID(), p_name: `Delete Test ${Date.now() % 100000}`, p_join_policy: 'open' });
const clanId = clan.id ?? clan.clan_id;
await partner.call('join_clan', { p_clan_id: clanId });

await step('the function refuses a call without the typed DELETE', async () => {
  const r = await callFunction(gone.session.access_token, { confirm: 'delete it' });
  assert(r.status === 400 && r.body?.error?.message === 'invalid_argument', `got ${r.status} ${JSON.stringify(r.body)}`);
  assert(sql(`select count(*) from auth.users where id = '${gone.id}'`) === '1', 'still there');
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: {
    cookies: [],
    origins: [{ origin: new URL(APP).origin, localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(gone.session) }] }],
  },
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
const shots = process.env.E2E_SHOTS;

await step('You → menu → Account → Delete account', async () => {
  await open(page, '/you');
  await page.getByRole('button', { name: 'Settings and privacy' }).first().click();
  await page.getByTestId('settings-account').click();
  await page.getByTestId('settings-account-screen').waitFor();
  const phone = await page.getByTestId('account-phone').innerText();
  assert(/••• ••• 9951/.test(phone) && !phone.includes('555 9951'), `masked phone: ${phone}`);
  await page.getByTestId('settings-delete-account').click();
  await page.getByTestId('delete-account').waitFor();
  if (shots) await page.screenshot({ path: join(shots, 'delete-account.png'), fullPage: true });
});

await step('it says what goes and what stays as Former member', async () => {
  const text = await page.getByTestId('delete-account').innerText();
  for (const s of ['DELETE ACCOUNT', 'WHAT GOES', 'Your messages, posts, photos and comments', 'WHAT STAYS, AS FORMER MEMBER',
                   'Former member', "can't be undone"]) {
    assert(text.includes(s), `missing "${s}"`);
  }
  assert(!/!/.test(text), 'no exclamation marks');
});

await step('the button waits for DELETE, then deletes and signs out', async () => {
  const submit = page.getByTestId('delete-account-submit');
  await page.getByTestId('delete-confirm-input').fill('DELET');
  assert(await submit.isDisabled(), 'disabled before DELETE');
  await page.getByTestId('delete-confirm-input').fill('DELETE');
  await until('enabled', async () => !(await submit.isDisabled()));
  await submit.click();
  await page.getByTestId('welcome-phone').waitFor({ timeout: 60_000 });
  const stored = await page.evaluate(() => window.localStorage.getItem('sb-127-auth-token'));
  assert(!stored, 'the session is gone from this device');
});

await step('the account is gone; the shared history stays as Former member', async () => {
  assert(sql(`select count(*) from auth.users where id = '${gone.id}'`) === '0', 'auth user deleted');
  assert(sql(`select count(*) from public.profiles where id = '${gone.id}'`) === '0', 'profile deleted');
  assert(sql(`select host_id from public.activities where id = '${activityId}'`) === FORMER, 'game host is Former member');
  assert(sql(`select count(*) from public.attendance where activity_id = '${activityId}' and user_id = '${partner.id}'`) === '1',
         'the partner keeps their attendance');
  assert(sql(`select created_by from public.clans where id = '${clanId}'`) === FORMER, 'clan kept, by Former member');
  const mine = await partner.call('my_clans');
  assert(mine.some((c) => c.clan_id === clanId), 'the partner is still in the clan');
  assert(sql(`select display_name from public.profiles where id = '${FORMER}'`) === 'Former member', 'placeholder name');
});

await step('audited without personal data, and idempotent', async () => {
  const row = sql(`select detail::text from private.trust_audit where action = 'account_self_deleted' order by id desc limit 1`);
  assert(row.includes('"source": "app"') && !row.includes(gone.id), `audit row: ${row}`);
  assert(sql(`select count(*) from private.trust_audit where detail::text like '%${gone.id}%' or target_user_id = '${gone.id}'`) === '0',
         'no audit row names them');
  const again = await callFunction(gone.session.access_token, { confirm: 'DELETE' });
  assert(again.status === 200 && again.body?.status === 'already_deleted', `again: ${again.status} ${JSON.stringify(again.body)}`);
});

await step('a paused account can delete itself from the paused screen', async () => {
  const paused = await signIn({ phone: '+15555559956', name: 'Paused T' }, { fresh: true });
  sql(`insert into private.account_pauses (user_id, reason, staff_note, starts_at)
       values ('${paused.id}', 'spam', 'e2e', now() - interval '1 minute');`);
  const pctx = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(APP).origin, localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(paused.session) }] }],
    },
    viewport: { width: 390, height: 844 },
  });
  const p = await pctx.newPage();
  await open(p, '/', 'paused-screen');
  await p.getByTestId('paused-delete-account').click();
  await p.getByTestId('delete-account').waitFor();
  await p.getByTestId('delete-confirm-input').fill('DELETE');
  const submit = p.getByTestId('delete-account-submit');
  await until('enabled', async () => !(await submit.isDisabled()));
  await submit.click();
  // Signed out: the sign-in screens (Welcome, or the phone step when the gate lands there).
  await p.locator('[data-testid="welcome-phone"], [data-testid="phone-input"]').first().waitFor({ timeout: 60_000 });
  assert(sql(`select count(*) from auth.users where id = '${paused.id}'`) === '0', 'paused account deleted');
  await pctx.close();
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
