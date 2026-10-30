// Step 8 e2e (SCR-PAYMENTS): Stripe payments, test mode, against the local Supabase stack, the
// payments edge functions pointed at stripe-mock, and the Expo web app.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/payments.e2e.mjs
//
// Needs: `npx supabase start` with the Step 8 migrations, `scripts/stripe-mock.sh start`, the
// functions served with supabase/functions/.env (docs/PAYMENTS_CONTRACT.md, Local development), the
// Expo web dev server and Playwright. stripe-mock never sends webhooks, so Stripe's side is played by
// the contract's documented test helper (`scripts/stripe-mock.sh account-ready | complete-checkout`),
// which signs a test event with the local secret and posts it to `stripe-webhook`.
//
// No browser ever reaches stripe.com: every navigation to a Stripe host is caught by Playwright and
// answered with a stub page; the test then follows the return link the way Stripe would.
//
// Re-runnable: its own host and player (phones +1 555 555 989x, never the seeded people), its own
// program, series, pass and checkouts. Assertions never depend on global counts or the time of day.
import { execFileSync, execSync } from 'node:child_process';
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
const PASSWORD = 'ojoro-e2e-password';
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
  host: { phone: '+15555559891', name: 'Hana P' },
  player: { phone: '+15555559892', name: 'Pip P' },
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

const key = () => randomUUID();

/** Plays Stripe: the contract's local test helper signs and posts the event to stripe-webhook. */
function stripeHelper(...args) {
  return execFileSync(join(root, 'scripts', 'stripe-mock.sh'), args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

const STRIPE_HOSTS = /^https?:\/\/([a-z0-9-]+\.)*stripe\.com\//i;

async function browserAs(browser, person) {
  const storageState = {
    cookies: [],
    origins: [{ origin: new URL(APP).origin, localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(person.session) }] }],
  };
  const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  // Never reach Stripe: answer its hosted pages with a stub and remember where we were sent.
  const opened = [];
  await ctx.route(STRIPE_HOSTS, (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>Stripe test stub</h1></body></html>' });
  });
  return { ctx, page, opened };
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

async function text(page, testId) {
  return (await page.getByTestId(testId).first().innerText()).replace(/\s+/g, ' ').trim();
}

async function latestCheckout(userId, kind) {
  const { data, error } = await admin
    .from('payment_checkouts')
    .select('id, status, kind, url, amount_cents')
    .eq('user_id', userId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const browser = await chromium.launch();
const contexts = [];
let exitCode = 0;
const tag = Date.now().toString(36).slice(-5);
const shots = process.env.E2E_SHOTS;
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true }).catch(() => {});
};

try {
  const host = await signIn(PEOPLE.host);
  const player = await signIn(PEOPLE.player);

  // A fresh program with a daily series at $8 a drop-in, open to join, so a session is always near.
  const program = await host.call('create_host_program', { p_name: `E2E Paid ${tag}`, p_sport_id: 'football', p_idempotency_key: key() });
  const today = new Date().toISOString().slice(0, 10);
  await host.call('create_series', {
    p_program_id: program.id,
    p_idempotency_key: key(),
    p_settings: {
      name: `E2E Paid 5s ${tag}`,
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
  const packName = `10-pack ${tag}`;
  await host.call('create_host_pass', {
    p_program_id: program.id,
    p_kind: 'pack',
    p_name: packName,
    p_price_cents: 7000,
    p_currency: 'CAD',
    p_sessions_included: 10,
    p_valid_days: 120,
    p_idempotency_key: key(),
  });
  const week = await host.call('host_week', { p_program_id: program.id });
  const session = week.find((w) => w.kind === 'session' && w.status === 'scheduled' && new Date(w.starts_at) > new Date());
  assert(session, 'no upcoming session in the new series');
  await player.call('join_waitlist', { p_activity_id: session.object_id, p_idempotency_key: key() });

  const H = await browserAs(browser, host);
  const P = await browserAs(browser, player);
  contexts.push(H.ctx, P.ctx);

  await step('Before payouts are set up, the player is told to pay at the field', async () => {
    await open(P.page, `/activity/${session.object_id}`, 'session-pay');
    const block = await text(P.page, 'session-pay');
    assert(/at the field/i.test(block), `pay block "${block}"`);
    assert((await P.page.getByTestId('session-pay-button').count()) === 0, 'no PAY button before payments are connected');
  });

  await step('Host: SET UP PAYOUTS opens Stripe onboarding, TEST MODE shows, and nothing reads PAID', async () => {
    await open(H.page, `/host/${program.id}/payments`, 'host-payments-not-connected');
    const block = await text(H.page, 'host-payments');
    assert(/NOT CONNECTED/.test(block), `account block "${block}"`);
    assert(/TEST MODE/.test(await text(H.page, 'host-payments-test-mode')), 'TEST MODE label for hosts');
    const primary = H.page.getByTestId('host-connect-primary');
    assert(/SET UP PAYOUTS/.test(await primary.innerText()), 'SET UP PAYOUTS button');
    await shot(H.page, 'host-membership-not-connected');
    await primary.click();
    await until('Stripe onboarding opened', async () => H.opened.length > 0, 30_000);
    assert(STRIPE_HOSTS.test(H.opened[0]), `onboarding went to ${H.opened[0]}`);
    // Stripe sends the host back through payments-return; land where it redirects.
    await open(H.page, `/host/${program.id}/payments?connect=return`, 'host-connect-return');
    const after = await text(H.page, 'host-payments');
    assert(/SETUP NOT FINISHED|NEEDS INFO|NOT CONNECTED/.test(after), `after return "${after}"`);
    await shot(H.page, 'host-membership-onboarding');
  });

  await step('Host: Stripe says the account is ready → READY, payouts set up', async () => {
    stripeHelper('account-ready', program.id);
    try {
      await H.page.getByTestId('host-payments-ready').waitFor({ timeout: 20_000 });
    } catch {
      await open(H.page, `/host/${program.id}/payments`, 'host-payments-ready');
    }
    const block = await text(H.page, 'host-payments');
    assert(/READY/.test(block) && /Payments are on/.test(block), `ready block "${block}"`);
    const past = await text(H.page, 'host-past-payouts');
    assert(!/\bPAID\b/.test(past), 'no payout reads PAID until Stripe pays it');
    await shot(H.page, 'host-membership-ready');
  });

  await step('Player: PAY $8 opens Stripe Checkout; the return waits for Stripe, then says PAID', async () => {
    await open(P.page, `/activity/${session.object_id}`, 'session-pay-button');
    assert(/Your spot is \$8/.test(await text(P.page, 'session-pay')), 'session price in words');
    assert((await P.page.getByTestId('session-pay-test-mode').count()) > 0, 'test mode on the buy flow');
    await shot(P.page, 'activity-pay');
    const before = P.opened.length;
    await P.page.getByTestId('session-pay-button').click();
    await until('Stripe Checkout opened', async () => P.opened.length > before, 30_000);
    const checkout = await until('checkout row', async () => latestCheckout(player.id, 'drop_in'));
    assert(checkout.amount_cents === 800, `server price ${checkout.amount_cents}`);

    // Back on the success link before the webhook: still checking, never "paid".
    await open(P.page, `/pay/return?checkout_id=${checkout.id}&result=success`, 'pay-return-headline');
    const waiting = await text(P.page, 'pay-return-headline');
    assert(/CHECKING WITH STRIPE|STILL CHECKING/.test(waiting), `before webhook "${waiting}"`);
    await shot(P.page, 'pay-return-checking');

    stripeHelper('complete-checkout', checkout.id);
    await until('PAID headline', async () => (await text(P.page, 'pay-return-headline')) === 'PAID.', 30_000);
    assert(/Paid \$8/.test(await text(P.page, 'pay-return-body')), 'paid sentence');
    await shot(P.page, 'pay-return-paid');

    await P.page.getByTestId('pay-return-game').click();
    await P.page.getByTestId('session-pay-title').waitFor({ timeout: 30_000 });
    await until('activity says paid', async () => /Paid \$8/.test(await text(P.page, 'session-pay-title')), 30_000);
  });

  await step('Host roster shows the real charge in words', async () => {
    await open(H.page, `/host/${program.id}/session/${session.session_id ?? session.id}`, 'host-roster');
    await until('PAID on the roster', async () => /PAID/.test(await text(H.page, 'host-roster')), 30_000);
  });

  await step('Player: GET A PASS, leave Stripe without paying (NOT PAID YET), then pay; it shows in Passes and payments', async () => {
    await open(P.page, `/pay/program/${program.id}?session=${session.session_id ?? session.id}`, 'pay-program');
    const pass = P.page.locator('[data-testid^="pay-pass-buy-"]').first();
    assert(/PAY \$70/.test(await pass.innerText()), 'pack price from the server');
    await shot(P.page, 'pay-program');
    const before = P.opened.length;
    await pass.click();
    await until('Stripe Checkout opened', async () => P.opened.length > before, 30_000);
    const checkout = await until('pack checkout', async () => latestCheckout(player.id, 'pack'));

    await open(P.page, `/pay/return?checkout_id=${checkout.id}&result=cancel`, 'pay-return-headline');
    assert((await text(P.page, 'pay-return-headline')) === 'NOT PAID YET.', 'cancelled return');
    assert(/nothing was charged/i.test(await text(P.page, 'pay-return-body')), 'cancel body');
    await P.page.getByTestId('pay-return-resume').waitFor({ timeout: 10_000 });
    await shot(P.page, 'pay-return-cancel');

    stripeHelper('complete-checkout', checkout.id);
    await until('PAID headline', async () => (await text(P.page, 'pay-return-headline')) === 'PAID.', 30_000);

    await open(P.page, '/pay', 'pay-mine-passes');
    await until('pass listed', async () => (await text(P.page, 'pay-mine-passes')).includes(program.name ?? `E2E Paid ${tag}`), 20_000);
    const passes = await text(P.page, 'pay-mine-passes');
    assert(/10 sessions left|sessions left/.test(passes), `passes "${passes}"`);
    const receipts = await text(P.page, 'pay-mine-receipts');
    assert(/\$70/.test(receipts) && /\$8/.test(receipts) && /PAID/.test(receipts), `receipts "${receipts}"`);
    await shot(P.page, 'pay-mine');
  });

  await step('A completed checkout cannot be paid again: the pass page says what I hold', async () => {
    await open(P.page, `/pay/program/${program.id}`, 'pay-holding');
    assert(/You hold a pass here/.test(await text(P.page, 'pay-holding')), 'holding row');
  });
} catch (error) {
  exitCode = 1;
  if (shots) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(shots, `fail-${i}.png`), fullPage: true }).catch(() => {});
    }
  }
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(exitCode || failed ? 1 : 0);
