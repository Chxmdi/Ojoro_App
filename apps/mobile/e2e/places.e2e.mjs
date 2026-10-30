// Step 7 e2e: Pulse and Place against the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/places.e2e.mjs
//
// Needs: `npx supabase start` (local stack, seeded with supabase/seed_places.sql), the Expo web dev
// server (E2E_APP_URL, default http://localhost:8100), psql and Playwright. Read-only: it signs in as
// the seeded Chimdi (+1 555 555 0100) and one own user (+1 555 555 9931, Plateau, no plans) for the
// privacy checks. Robust to extra seed data and the time of day (the counts are not pinned).
//
// Checks:
//   1. Discover's MAP opens Pulse: header, filters, legend, map with a text alternative, the sheet.
//   2. A place link (`/pulse?place=`) opens its sheet with facts and the headline; the list view
//      shows the same places as rows, and selecting a row moves the sheet.
//   3. Sport and time chips refetch the map; an empty filter offers to widen.
//   4. OPEN PLACE opens Place: name, facts, TONIGHT HERE, RITUALS HERE, HOSTS HERE, WHEN IT'S BUSY.
//   5. CREATE ACTIVITY HERE opens the create form with the place picked.
//   6. Report is reachable from Place; an unknown place shows the not-found state.
//   7. Discover's place results and PlaceMiniCards open Place.
//   8. Offline keeps Place with its time.
//   9. Privacy: Pulse carries no person; exact spots stay inside plans you've joined.
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


const JM = 'b0000000-0000-4000-8000-000000000001';

async function signInOwn({ phone, name }) {
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
  const call = async (fn, args) => {
    const { data, error } = await c.rpc(fn, args);
    if (error) throw new Error(`${name} ${fn}: ${error.message} ${error.details ?? ''}`);
    return data;
  };
  await call('save_onboarding', {
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_display_name: name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
  return { client: c, call, session: res.data.session, id: res.data.user.id, name };
}

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
let exitCode = 0;

try {
  const chimdi = await signInSeeded('+15555550100');
  const outsider = await signInOwn({ phone: '+15555559931', name: 'Nia P' });
  const C = await browserAs(browser, chimdi);
  const page = C.page;

  await step('Discover MAP opens Pulse with filters, legend, map and sheet', async () => {
    await open(page, '/discover');
    await page.getByRole('heading', { name: 'RIGHT NOW.' }).waitFor({ timeout: 90_000 });
    await page.getByTestId('discover-map').click();
    await page.waitForURL(/\/pulse/, { timeout: 30_000 });
    await page.getByRole('heading', { name: 'PULSE' }).waitFor({ timeout: 60_000 });
    await page.getByTestId('pulse-sport-all').waitFor();
    await page.getByTestId('pulse-when-tonight').waitFor();
    await page.getByText('People want it').waitFor();
    const caption = await page.getByTestId('pulse-caption').textContent();
    assert(/^Tonight/.test(caption ?? ''), `caption: ${caption}`);
    const map = page.locator('[aria-label^="Map of"]').first();
    await map.waitFor({ timeout: 60_000 });
    const alt = await map.getAttribute('aria-label');
    assert(/Jeanne-Mance Park/.test(alt ?? ''), `text alternative: ${alt}`);
    await page.getByTestId('pulse-sheet').waitFor();
    await page.getByText("Areas, not people. Exact spots show only inside plans you've joined.").first().waitFor();
  });

  await step('a place link opens its sheet; the list shows the same places', async () => {
    await open(page, `/pulse?place=${JM}`);
    const title = page.getByTestId('pulse-sheet-title');
    await title.waitFor({ timeout: 60_000 });
    assert((await title.textContent()) === 'Jeanne-Mance Park', `sheet: ${await title.textContent()}`);
    const facts = await page.getByTestId('pulse-sheet-facts').textContent({ timeout: 30_000 });
    assert(/^Football/.test(facts ?? ''), `facts: ${facts}`);
    await page.getByTestId('pulse-sheet-headline').waitFor();
    await page.getByTestId('area-map-toggle').click();
    const row = page.getByTestId(`area-map-row-place:${JM}`);
    await row.waitFor({ timeout: 20_000 });
    assert(/Selected/.test((await row.getAttribute('aria-label')) ?? ''), 'list row not selected');
    const other = page.locator('[data-testid^="area-map-row-"]:not([data-testid$="' + JM + '"])').first();
    if ((await other.count()) > 0) {
      await other.click();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="pulse-sheet-title"]')?.textContent !== 'Jeanne-Mance Park',
        null,
        { timeout: 20_000 },
      );
    }
    await page.getByTestId('area-map-toggle').click();
    await page.getByTestId(`area-map-marker-place:${JM}`).waitFor({ timeout: 20_000 });
  });

  await step('sport and time chips refetch; an empty filter offers to widen', async () => {
    await open(page, '/pulse');
    await page.getByTestId('pulse-sport-all').waitFor({ timeout: 60_000 });
    const football = page.getByTestId('pulse-sport-football');
    if ((await football.count()) > 0) {
      const res = page.waitForResponse((r) => r.url().includes('/rpc/pulse') && (r.request().postData() ?? '').includes('football'));
      await football.click();
      assert((await res).ok(), 'pulse with football failed');
    }
    const res = page.waitForResponse((r) => r.url().includes('/rpc/pulse') && (r.request().postData() ?? '').includes('"now"'));
    await page.getByTestId('pulse-when-now').click();
    assert((await res).ok(), 'pulse for the next hour failed');
    const caption = await page.getByTestId('pulse-caption').textContent();
    assert(/^Next hour/.test(caption ?? ''), `caption: ${caption}`);
    // Whatever the hour, the screen shows either markers with a sheet, or the empty state with WIDEN.
    await page.locator('[data-testid="pulse-sheet"], [data-testid="pulse-empty"]').first().waitFor({ timeout: 20_000 });
    if ((await page.getByTestId('pulse-empty').count()) > 0) await page.getByTestId('pulse-widen').waitFor();
  });

  await step('OPEN PLACE opens Place with every block', async () => {
    await open(page, `/pulse?place=${JM}`);
    await page.getByTestId('pulse-open-place').click({ timeout: 60_000 });
    await page.waitForURL(new RegExp(`/place/${JM}`), { timeout: 30_000 });
    await page.getByTestId('place-name').waitFor({ timeout: 60_000 });
    assert((await page.getByTestId('place-name').textContent()) === 'JEANNE-MANCE PARK.', 'place name');
    assert(/^PLATEAU/.test((await page.getByTestId('place-overline').textContent()) ?? ''), 'overline');
    assert(/Football/.test((await page.getByTestId('place-facts').textContent()) ?? ''), 'facts');
    await page.getByTestId('place-directions').waitFor();
    for (const id of ['place-tonight', 'place-rituals', 'place-hosts', 'place-busy']) await page.getByTestId(id).waitFor();
    await page.locator('[data-testid^="tonight-"]').first().waitFor({ timeout: 30_000 });
    await page.locator('[data-testid^="ritual-crew_ritual"]').first().waitFor({ timeout: 30_000 });
    await page.getByText('TRUSTED HOST').first().waitFor({ timeout: 30_000 });
  });

  await step('CREATE ACTIVITY HERE opens the create form with the place picked', async () => {
    await open(page, `/place/${JM}`);
    await page.getByTestId('create-activity-here').click({ timeout: 60_000 });
    await page.waitForURL(/\/create\/plan/, { timeout: 30_000 });
    const chip = page.getByTestId(`place-${JM}`);
    await chip.waitFor({ timeout: 60_000 });
    const checked = (await chip.getAttribute('aria-checked')) ?? (await chip.getAttribute('aria-selected'));
    assert(checked === 'true', `place chip not picked (${checked})`);
  });

  await step('report is reachable from Place; an unknown place says so', async () => {
    await open(page, `/place/${JM}`);
    await page.getByTestId('header-more').click({ timeout: 60_000 });
    await page.getByText(/Report this place/).first().waitFor({ timeout: 20_000 });
    await open(page, '/place/b0000000-0000-4000-8000-0000000000ff');
    await page.getByTestId('place-unavailable').waitFor({ timeout: 60_000 });
  });

  await step("Discover's place results and cards open Place", async () => {
    await open(page, '/discover');
    await page.getByRole('heading', { name: 'RIGHT NOW.' }).waitFor({ timeout: 90_000 });
    const card = page.locator('[data-testid^="place-b0000000"]').first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();
    await page.waitForURL(/\/place\//, { timeout: 30_000 });
    await page.getByTestId('place-name').waitFor({ timeout: 60_000 });
    await open(page, '/discover');
    await page.getByTestId('discover-search').fill('jeanne', { timeout: 90_000 });
    await page.getByTestId(`result-place-${JM}`).click({ timeout: 30_000 });
    await page.waitForURL(new RegExp(`/place/${JM}`), { timeout: 30_000 });
    await page.getByTestId('place-name').waitFor({ timeout: 60_000 });
  });

  await step('offline keeps Place with its time', async () => {
    await open(page, `/place/${JM}`);
    await page.getByTestId('place-name').waitFor({ timeout: 60_000 });
    await setOffline(page, true);
    const note = page.getByTestId('offline-note');
    await note.waitFor({ timeout: 20_000 });
    assert(/as of \d/.test((await note.textContent()) ?? ''), `offline: ${await note.textContent()}`);
    await page.getByTestId('place-name').waitFor();
    await setOffline(page, false);
  });

  await step('privacy: Pulse has no people; exact spots only for members', async () => {
    const markers = await outsider.call('pulse', {});
    assert(markers.length > 0, 'no markers');
    for (const m of markers) {
      for (const k of Object.keys(m)) assert(!/user|person|avatar|handle/.test(k), `pulse column ${k}`);
    }
    const tonight = await outsider.call('place_tonight', { p_place_id: JM });
    for (const t of tonight) {
      if (!t.i_am_in) assert(t.meeting_point === null, `meeting point leaked: ${t.meeting_point}`);
    }
    const mine = await chimdi.client.rpc('place_tonight', { p_place_id: JM });
    assert(!mine.error, 'chimdi place_tonight');
  });

  await C.ctx.close();
} catch (error) {
  console.log('error', error);
  exitCode = 1;
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 || exitCode ? 1 : 0);
