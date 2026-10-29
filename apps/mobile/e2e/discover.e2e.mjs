// Step 3 e2e: Discover against the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/discover.e2e.mjs
//
// Needs: `npx supabase start` (local stack, seeded), the Expo web dev server (E2E_APP_URL, default
// http://localhost:8100), psql and Playwright. Re-runnable: it re-runs supabase/seed_liquidity.sql at
// the start (fresh "starts in 40 min" rows and volleyball demand) and at the end (MAKE IT HAPPEN uses
// the demand up), and uses its own two users (+1 555 555 9801 / 9802) for anything that writes.
// Read-only checks sign in as the seeded Chimdi (+1 555 555 0100), whose data the seed describes.
//
// Checks:
//   1. Search finds a seeded plan and a place.
//   2. Sport and time chips narrow the results.
//   3. Ojoro Now shows the reasons and opens a plan.
//   4. Latent demand is a count with no names.
//   5. SURPRISE ME returns one suggestion with its reason.
//   6. MAKE IT HAPPEN creates exactly one plan on a double tap, and opens it.
//   7. A user with no area sees the area prompt.
//   8. Offline keeps the last results with their time.
import { execSync } from 'node:child_process';
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
const DB = process.env.E2E_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PASSWORD = 'ojoro-e2e-password';

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

const psql = (sql) => execSync(`psql "${DB}" -X -q -t -A -v ON_ERROR_STOP=1`, { input: sql }).toString().trim();
const reseed = () =>
  execSync(`psql "${DB}" -X -q -v ON_ERROR_STOP=1 -f supabase/seed_liquidity.sql`, { cwd: root, stdio: 'ignore' });

const SEED_VOLLEYBALL_NAMES = ['Ana P', 'Luc D', 'Zoe F', 'Max R', 'Ola S'];

async function client() {
  return createClient(URL_, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
}

/** Chimdi, seeded, read-only here. */
async function signInSeeded(phone) {
  const c = await client();
  const { data, error } = await c.auth.verifyOtp({ phone, token: '123456', type: 'sms' });
  if (error) throw new Error(`sign in ${phone}: ${error.message}`);
  return { client: c, session: data.session, id: data.user.id, name: phone };
}

/** One of this file's own users, reset to a known state. */
async function signInOwn({ phone, name, area }) {
  const c = await client();
  let res = await c.auth.signInWithPassword({ phone, password: PASSWORD });
  if (res.error) {
    const made = await admin.auth.admin.createUser({
      phone,
      password: PASSWORD,
      phone_confirm: true,
      user_metadata: { display_name: name },
    });
    if (made.error) throw new Error(`create ${name}: ${made.error.message}`);
    res = await c.auth.signInWithPassword({ phone, password: PASSWORD });
    if (res.error) throw new Error(`sign in ${name}: ${res.error.message}`);
  }
  const id = res.data.user.id;
  const call = async (fn, args) => {
    const { data, error } = await c.rpc(fn, args);
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
  await call('save_onboarding', {
    p_sports: [{ sport_id: 'volleyball', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 3,
    p_display_name: name,
    ...(area ? { p_area: 'Plateau, Montréal', p_area_lat: 45.52, p_area_lng: -73.58 } : null),
  });
  // Local reset (this file's users only): no area for the no-area user, nothing left forming or
  // active, and plans formed from signals in earlier runs moved out of the 24 h rate-limit window.
  if (!area) {
    psql(`update public.profiles set area = null where id = '${id}';
          update public.profile_private set area_lat = null, area_lng = null where user_id = '${id}';`);
  }
  const { data: mine } = await c.from('plan_cards').select('id, activity_id, effective_status').eq('host_id', id);
  for (const p of mine ?? []) {
    if (p.activity_id) await call('cancel_activity', { p_activity_id: p.activity_id }).catch(() => {});
    else if (p.effective_status === 'forming') await call('cancel_plan', { p_plan_id: p.id }).catch(() => {});
  }
  const { data: signals } = await c.from('intent_signals').select('id').eq('user_id', id).eq('status', 'active');
  for (const s of signals ?? []) await call('withdraw_down_for', { p_signal_id: s.id });
  psql(`update public.plans set created_at = created_at - interval '25 hours'
        where created_by = '${id}' and source = 'down_for' and created_at > now() - interval '24 hours';`);
  return { client: c, call, session: res.data.session, id, name };
}

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

async function setOffline(page, offline) {
  await page.context().setOffline(offline);
  await page.evaluate(() => {
    const target = navigator.connection ?? window;
    target.dispatchEvent(new Event(navigator.onLine ? 'online' : 'offline'));
    navigator.connection?.dispatchEvent(new Event('change'));
  });
}

async function open(page, path) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}${path}`, { waitUntil: 'load' });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
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

const search = (page) => page.getByTestId('discover-search');

/** The debounce has settled and the summary no longer says Searching…. */
async function settle(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(
    () => {
      const t = document.querySelector('[data-testid="results-summary"]')?.textContent;
      return !!t && !t.includes('Searching');
    },
    null,
    { timeout: 20_000 },
  );
}

async function typeSearch(page, text) {
  await search(page).fill(text);
  await page.getByTestId('search-results').waitFor({ timeout: 20_000 });
  await settle(page);
}

// ---------------------------------------------------------------------------------------------

reseed();
const browser = await chromium.launch();
let exitCode = 0;

try {
  const chimdi = await signInSeeded('+15555550100');
  const maker = await signInOwn({ phone: '+15555559801', name: 'Kemi E', area: true });
  const lost = await signInOwn({ phone: '+15555559802', name: 'Femi E', area: false });

  const C = await browserAs(browser, chimdi);
  await open(C.page, '/discover');
  await C.page.getByRole('heading', { name: 'RIGHT NOW.' }).waitFor({ timeout: 90_000 });

  await step('search finds a seeded plan and a place', async () => {
    await typeSearch(C.page, 'jeanne');
    const results = C.page.getByTestId('search-results');
    await results.getByText('Tennis doubles').waitFor({ timeout: 10_000 });
    await results.getByText('Football tonight').waitFor();
    await C.page.getByTestId('result-place-b0000000-0000-4000-8000-000000000001').waitFor();
    const summary = await C.page.getByTestId('results-summary').textContent();
    assert(/3 results for “jeanne”/.test(summary ?? ''), `summary: ${summary}`);
  });

  await step('filter chips narrow the results', async () => {
    await open(C.page, '/discover');
    await C.page.getByRole('heading', { name: 'RIGHT NOW.' }).waitFor({ timeout: 60_000 });
    await C.page.getByTestId('kind-plans').click();
    await settle(C.page);
    await C.page.getByTestId('search-results').getByText('Football tonight').waitFor({ timeout: 20_000 });
    const before = await C.page.getByTestId('search-results').getByRole('button').count();
    await C.page.getByTestId('sport-tennis').click();
    await settle(C.page);
    await C.page.getByText(/in tennis/).waitFor({ timeout: 20_000 });
    await C.page.getByTestId('search-results').getByText('Tennis doubles').waitFor();
    await C.page.getByTestId('search-results').getByText('Football tonight').waitFor({ state: 'detached', timeout: 10_000 });
    const after = await C.page.getByTestId('search-results').getByRole('button').count();
    assert(after < before, `not narrower: ${before} → ${after}`);
    // Tennis doubles starts this morning: tonight has none, and the empty state offers a way on.
    await C.page.getByTestId('when-tonight').click();
    await C.page.getByTestId('results-empty').waitFor({ timeout: 20_000 });
    await C.page.getByTestId('results-surprise').waitFor();
    await C.page.getByTestId('clear-search').click();
    await C.page.getByTestId('discover-feed').waitFor({ timeout: 10_000 });
  });

  await step('Ojoro Now shows reasons and opens a plan', async () => {
    await open(C.page, '/discover');
    const list = C.page.getByTestId('ojoro-now-list');
    await list.waitFor({ timeout: 20_000 });
    const text = (await list.textContent()) ?? '';
    for (const want of ['Sparring rounds', 'Evening 5K', 'Tennis doubles', "you've played with", ' km']) {
      assert(text.includes(want), `missing "${want}" in Ojoro Now: ${text}`);
    }
    const summary = await C.page.getByTestId('ojoro-now-summary').textContent();
    assert(/3 things start soon\./.test(summary ?? ''), `summary: ${summary}`);
    await list.getByText('Tennis doubles').click();
    await C.page.waitForURL(/\/plan\/d0000000-0000-4000-8000-000000000003/, { timeout: 20_000 });
    await C.page.goBack();
    await C.page.getByTestId('ojoro-now-list').waitFor({ timeout: 20_000 });
  });

  await step('latent demand shows a count with no names', async () => {
    const panel = C.page.getByTestId('latent-demand');
    await panel.waitFor({ timeout: 20_000 });
    const text = (await panel.textContent()) ?? '';
    assert(text.includes('NOTHING ON FOR VOLLEYBALL'), text);
    assert(/5 people within 3 km want to play volleyball after 7\. That's a game\./.test(text), text);
    assert(text.includes("Nobody's name or location is shared"), 'privacy line missing');
    for (const n of SEED_VOLLEYBALL_NAMES) {
      assert(!text.includes(n), `name ${n} shown`);
      assert((await C.page.getByText(n, { exact: true }).count()) === 0, `name ${n} on the page`);
    }
  });

  await step('SURPRISE ME returns a suggestion with its reason', async () => {
    await C.page.getByTestId('latent-demand').getByRole('button', { name: 'SURPRISE ME' }).click();
    const panel = C.page.getByTestId('surprise-result');
    await panel.waitFor({ timeout: 20_000 });
    const text = (await panel.textContent()) ?? '';
    assert(text.includes('Why: '), `no reason: ${text}`);
    await panel.getByRole('button', { name: 'SEE THE PLAN' }).click();
    await C.page.waitForURL(/\/plan\//, { timeout: 20_000 });
  });

  await step('offline shows the last results with their time', async () => {
    await open(C.page, '/discover');
    await C.page.getByRole('heading', { name: 'RIGHT NOW.' }).waitFor({ timeout: 60_000 });
    await typeSearch(C.page, 'plateau');
    await C.page.getByTestId('search-results').getByText('Parc La Fontaine').first().waitFor({ timeout: 10_000 });
    await setOffline(C.page, true);
    const line = C.page.getByTestId('results-offline');
    await line.waitFor({ timeout: 10_000 });
    assert(/These results are from \d{1,2}:\d{2} (AM|PM)\./.test((await line.textContent()) ?? ''), 'no time');
    await C.page.getByTestId('search-results').getByText('Parc La Fontaine').first().waitFor();
    await C.page.getByTestId('clear-search').click();
    const banner = C.page.getByTestId('offline-banner');
    await banner.waitFor({ timeout: 10_000 });
    assert(/Showing Discover as of \d{1,2}:\d{2}/.test((await banner.textContent()) ?? ''), 'banner has no time');
    await C.page.getByTestId('ojoro-now-list').waitFor();
    await setOffline(C.page, false);
  });

  await step('MAKE IT HAPPEN creates exactly one plan on a double tap, and opens it', async () => {
    const M = await browserAs(browser, maker);
    await open(M.page, '/discover');
    const panel = M.page.getByTestId('latent-demand');
    await panel.waitFor({ timeout: 90_000 });
    assert(/5 people within 3 km/.test((await panel.textContent()) ?? ''), 'maker sees no 5-person demand');
    const button = panel.getByRole('button', { name: 'MAKE IT HAPPEN' });
    await button.dblclick();
    await button.click({ timeout: 2000 }).catch(() => {});
    await M.page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const planId = /\/plan\/([0-9a-f-]{36})/.exec(M.page.url())[1];
    await new Promise((r) => setTimeout(r, 1500));
    const made = psql(
      `select count(*) from public.plans where created_by = '${maker.id}' and created_at > now() - interval '5 minutes';`,
    );
    assert(made === '1', `plans made: ${made}`);
    const card = psql(`select sport_id || ' ' || member_count from public.plans where id = '${planId}';`);
    assert(card === 'volleyball 6', `plan: ${card}`);
    await M.ctx.close();
    // Call it off so it doesn't show on anyone's screens tonight.
    const { data: c } = await maker.client.from('plan_cards').select('activity_id').eq('id', planId).single();
    if (c?.activity_id) await maker.call('cancel_activity', { p_activity_id: c.activity_id });
    else await maker.call('cancel_plan', { p_plan_id: planId });
  });

  await step('a user with no area sees the area prompt', async () => {
    const L = await browserAs(browser, lost);
    await open(L.page, '/discover');
    const prompt = L.page.getByTestId('area-prompt');
    await prompt.waitFor({ timeout: 90_000 });
    assert((await L.page.getByTestId('ojoro-now').count()) === 0, 'Ojoro Now shown without an area');
    await prompt.getByRole('button', { name: 'PICK YOUR AREA' }).click();
    await L.page.waitForURL(/\/settings\/area/, { timeout: 20_000 });
    await L.ctx.close();
  });

  await C.ctx.close();
} catch (error) {
  console.log('error', error);
  exitCode = 1;
} finally {
  await browser.close();
  // Give the demand back to everyone else's screens.
  try {
    reseed();
  } catch (error) {
    console.log('reseed failed', error.message);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 || exitCode ? 1 : 0);
