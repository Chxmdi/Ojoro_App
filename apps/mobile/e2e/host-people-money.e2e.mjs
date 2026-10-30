// Step 6 e2e (SCR-HOST-B): HostPeople, HostMembership and HostAnnounce against the local Supabase
// stack and the Expo web app.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/host-people-money.e2e.mjs
//
// Needs: `npx supabase start` with the Step 6 migrations and seeds (seed_hosts.sql, seed_hosts_ops.sql),
// the Expo web dev server and Playwright. Re-runnable: it makes its own host and player (phones
// +1 555 555 986x, never the seeded people) and its own program, series, pass and refund request.
// People is checked against the seeded Plateau Pickup as Ade (read, plus a tag it adds and removes).
// Assertions never depend on global counts or the time of day.
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
const PLATEAU = 'c6000000-0000-4000-8000-000000000001';
const JEANNE_MANCE = 'b0000000-0000-4000-8000-000000000001';

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
  host: { phone: '+15555559861', name: 'Hana E' },
  player: { phone: '+15555559862', name: 'Pip E' },
};

async function clientFor(sign) {
  const client = createClient(URL_, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const res = await sign(client);
  if (res.error) throw new Error(res.error.message);
  const call = async (fn, args = {}) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
  return { client, call, session: res.data.session, id: res.data.user.id };
}

async function signIn({ phone, name }) {
  let person;
  try {
    person = await clientFor((c) => c.auth.signInWithPassword({ phone, password: PASSWORD }));
  } catch {
    const made = await admin.auth.admin.createUser({
      phone,
      password: PASSWORD,
      phone_confirm: true,
      user_metadata: { display_name: name },
    });
    if (made.error) throw new Error(`create ${name}: ${made.error.message}`);
    person = await clientFor((c) => c.auth.signInWithPassword({ phone, password: PASSWORD }));
  }
  await person.call('save_onboarding', {
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_pull_me_in: [],
    p_display_name: name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
  return { ...person, name, first: name.split(' ')[0] };
}

/** Ade (seeded host of Plateau Pickup) with code 123456. */
async function signInAde() {
  const person = await clientFor((c) => c.auth.verifyOtp({ phone: '+15555550101', token: '123456', type: 'sms' }));
  return { ...person, name: 'Ade B', first: 'Ade' };
}

const key = () => randomUUID();

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
    throw error;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
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

const browser = await chromium.launch();
const contexts = [];
let exitCode = 0;
const tag = Date.now().toString(36).slice(-5);

try {
  const host = await signIn(PEOPLE.host);
  const player = await signIn(PEOPLE.player);
  const ade = await signInAde();

  // A fresh program with one series every day, open to join, no approval, so a session is always near.
  const program = await host.call('create_host_program', { p_name: `E2E Pickup ${tag}`, p_sport_id: 'football', p_idempotency_key: key() });
  const today = new Date().toISOString().slice(0, 10);
  await host.call('create_series', {
    p_program_id: program.id,
    p_idempotency_key: key(),
    p_settings: {
      name: `E2E 5s ${tag}`,
      sport_id: 'football',
      place_id: JEANNE_MANCE,
      start_time: '23:30',
      duration_minutes: 20,
      capacity: 10,
      level: 'mixed',
      repeat_days: [1, 2, 3, 4, 5, 6, 7],
      starts_on: today,
      join_opens_days: 30,
      approval_required: false,
      price_cents: 800,
      member_price_cents: 0,
      currency: 'CAD',
    },
  });
  const week = await host.call('host_week', { p_program_id: program.id });
  const session = week.find((w) => w.kind === 'session' && w.status === 'scheduled' && new Date(w.starts_at) > new Date());
  assert(session, 'no upcoming session in the new series');
  await player.call('join_waitlist', { p_activity_id: session.object_id, p_idempotency_key: key() });

  const H = await browserAs(browser, host);
  const P = await browserAs(browser, player);
  const A = await browserAs(browser, ade);
  contexts.push(H.ctx, P.ctx, A.ctx);

  await step('A player who does not run the program sees the not-allowed page', async () => {
    await open(P.page, `/host/${program.id}/payments`, 'host-not-allowed');
  });

  await step('People: seeded regulars, filters, an open person with last 12, and a tag added then removed', async () => {
    await open(A.page, `/host/${PLATEAU}/people`, 'host-people-list');
    const headline = await A.page.getByTestId('host-people-headline').innerText();
    assert(/people have played with you/.test(headline), `headline "${headline}"`);
    await A.page.getByTestId('host-people-filter-members').click();
    await A.page.getByText('MEMBERS', { exact: true }).first().waitFor({ timeout: 15_000 });
    const first = A.page.locator('[data-testid^="host-person-"]').first();
    await first.click();
    await A.page.getByTestId('host-person-last12').waitFor({ timeout: 15_000 });
    const label = await A.page.getByTestId('host-person-last12').getAttribute('aria-label');
    assert(/^(Came to \d+ of the last \d+\.|No sessions to count yet\.)$/.test(label ?? ''), `last12 "${label}"`);
    await A.page.getByTestId('host-person-tags-edit').click();
    const word = `e2e ${tag}`;
    await A.page.getByTestId('host-person-tag-input').locator('input, textarea').first().fill(word);
    await A.page.getByTestId('host-person-tag-input').locator('input, textarea').first().press('Enter');
    await A.page.getByText(word.toUpperCase(), { exact: true }).waitFor({ timeout: 15_000 });
    await A.page.getByRole('button', { name: `Remove tag ${word}` }).click();
    await until('tag removed', async () => (await A.page.getByText(word.toUpperCase(), { exact: true }).count()) === 0);
    await A.page.getByTestId('host-people-search').locator('input').fill('zzzz-nobody');
    await A.page.getByTestId('host-people-empty').waitFor({ timeout: 15_000 });
  });

  await step('Announce: live count, template, preview, send, and it shows in SENT BEFORE', async () => {
    await open(H.page, `/host/${program.id}/announce?session=${session.session_id}`, 'host-announce-send');
    await until('count for the session', async () => /SEND TO \d+/.test(await H.page.getByTestId('host-announce-send').innerText()));
    const msg = `E2E ${tag}: bring a light and a dark shirt.`;
    await H.page.getByTestId('host-announce-message').locator('textarea, input').first().fill(msg);
    const preview = await H.page.getByTestId('host-announce-preview').innerText();
    assert(preview.includes(msg), `preview "${preview}"`);
    await H.page.getByTestId('host-announce-send').click();
    await H.page.getByText(msg, { exact: true }).nth(0).waitFor({ timeout: 20_000 });
    await until('history row', async () => (await H.page.locator('[data-testid^="host-announce-past-"]').count()) > 0);
    const row = await H.page.locator('[data-testid^="host-announce-past-"]').first().innerText();
    assert(/\d+ \/ \d+ READ/.test(row), `history row "${row}"`);
  });

  await step('Membership: payments not connected, NEW PASS, and a refund decision with UNDO', async () => {
    await open(H.page, `/host/${program.id}/payments`, 'host-payments-not-connected');
    await H.page.getByTestId('host-pass-new').click();
    await H.page.getByText('Monthly', { exact: true }).click();
    await H.page.getByTestId('host-pass-name').locator('input').fill(`Monthly ${tag}`);
    await H.page.getByTestId('host-pass-price').locator('input').fill('35');
    await H.page.getByTestId('host-pass-save').click();
    await H.page.getByText(`Monthly ${tag}`, { exact: true }).waitFor({ timeout: 20_000 });

    // The player holds the pass (recorded at the field), cancels and asks for money back.
    const money = await host.call('host_money_view', { p_program_id: program.id });
    const pass = money.passes.find((p) => p.name === `Monthly ${tag}`);
    assert(pass, 'pass not in host_money_view');
    const membershipId = await host.call('grant_host_pass', { p_pass_id: pass.id, p_user_id: player.id, p_paid: true, p_idempotency_key: key() });
    await player.call('cancel_host_membership', {
      p_membership_id: membershipId,
      p_idempotency_key: key(),
      p_refund_note: 'Shifts changed. Could I get some of it back?',
    });

    await H.page.reload({ waitUntil: 'load' });
    await H.page.getByTestId('host-refund-keep').waitFor({ timeout: 60_000 });
    const ledger = await H.page.getByTestId('host-next-payout').innerText();
    assert(/placeholder/i.test(ledger), 'the service fee is labelled a placeholder');
    await H.page.getByTestId('host-refund-keep').click();
    await H.page.getByTestId('host-refund-undo').waitFor({ timeout: 20_000 });
    await H.page.getByTestId('host-refund-undo').click();
    await H.page.getByTestId('host-refund-full').waitFor({ timeout: 20_000 });
    const full = await H.page.getByTestId('host-refund-full').innerText();
    assert(/REFUND ALL \$35/.test(full), `refund button "${full}"`);
    const past = await H.page.getByTestId('host-past-payouts').innerText();
    assert(!/\bPAID\b/.test(past), 'no payout claims PAID while payments are not connected');
  });
} catch (error) {
  exitCode = 1;
  if (process.env.E2E_SHOTS) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(process.env.E2E_SHOTS, `fail-${i}.png`), fullPage: true }).catch(() => {});
    }
  }
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} steps passed`);
process.exit(exitCode || (passed === results.length ? 0 : 1));
