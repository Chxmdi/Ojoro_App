// Step 6 e2e: Host OS core screens (HostHome, HostSeries, HostRoster, HostRequests) against the local
// Supabase stack and the Expo web app.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/host-core.e2e.mjs
//
// Needs: `npx supabase start` (with the Step 6 host migrations), the Expo web dev server and Playwright.
// Re-runnable: its own two test users (phones +1 555 555 988x, never the seeded people). The host reuses
// one program ("E2E Pickup") and makes a fresh week-long daily series per run, so nothing depends on the
// time of day or on what earlier runs left. Assertions never depend on global counts.
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
const PLACE = 'b0000000-0000-4000-8000-000000000001'; // Jeanne-Mance Park (seed), plays football

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
  host: { phone: '+15555559881', name: 'Hana E' },
  player: { phone: '+15555559882', name: 'Jules E' },
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
    p_sports: [{ sport_id: 'football', level: 'casual', is_main: true }],
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
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 180_000 });
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
      await sleep(20_000);
    }
  }
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 60_000 });
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

/** YYYY-MM-DD in Montréal. */
function montrealDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(d);
}

const browser = await chromium.launch();
const contexts = [];
let exitCode = 0;
const state = {};

try {
  const host = await signIn(PEOPLE.host);
  const player = await signIn(PEOPLE.player);

  await step('host has a program and a fresh daily series with approval on', async () => {
    const mine = await host.call('my_host_programs');
    const existing = mine.find((p) => p.name === 'E2E Pickup');
    state.program = existing
      ? existing.id
      : (await host.call('create_host_program', { p_name: 'E2E Pickup', p_sport_id: 'football', p_idempotency_key: key() })).id;
    const today = montrealDate(new Date());
    const until_on = montrealDate(new Date(Date.now() + 7 * 86_400_000));
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
    const series = await host.call('create_series', {
      p_program_id: state.program,
      p_settings: {
        name: `E2E run ${stamp}`,
        sport_id: 'football',
        place_id: PLACE,
        start_time: '20:00',
        duration_minutes: 60,
        capacity: 4,
        level: 'mixed',
        repeat_days: [1, 2, 3, 4, 5, 6, 7],
        starts_on: today,
        until_on,
        join_opens_days: 5,
        approval_required: true,
        price_cents: 800,
      },
      p_idempotency_key: key(),
    });
    state.series = series.id;
    const sessions = await host.call('series_sessions', { p_series_id: state.series, p_limit: 6 });
    // A session at least a day out that is already open for joining: independent of the time of day.
    const pick = sessions.find(
      (s) => new Date(s.starts_at).getTime() > Date.now() + 26 * 3_600_000 && new Date(s.opens_at).getTime() <= Date.now(),
    );
    assert(pick, `no open session a day out: ${JSON.stringify(sessions.map((s) => [s.occurs_on, s.opens_at]))}`);
    state.session = pick.session_id;
    state.sessions = sessions;
  });

  await step('a newcomer asks to join and waits for the host', async () => {
    const res = await player.call('ask_to_join', {
      p_session_id: state.session,
      p_note: 'New in town, keen to play.',
      p_idempotency_key: key(),
    });
    assert(res.request_status === 'pending', `request ${JSON.stringify(res)}`);
  });

  const H = await browserAs(browser, host);
  const J = await browserAs(browser, player);
  contexts.push(H.ctx, J.ctx);

  await step('HostHome: YOUR WEEK., a REVIEW in NEEDS YOU, this week and the tools', async () => {
    await open(H.page, `/host/${state.program}`, 'host-home');
    await H.page.getByText('YOUR WEEK.').waitFor();
    await H.page.getByTestId('needs-you-0').waitFor({ timeout: 20_000 });
    const review = H.page.locator(`a[href$="/session/${state.session}/requests"]`);
    assert((await review.count()) >= 1, 'a link to the requests of our session');
    await H.page.getByTestId('host-tool-people').waitFor();
    await H.page.getByText('LAST 30 DAYS').waitFor();
  });

  await step('HostRequests: approve, undo, approve again; the count follows', async () => {
    await open(H.page, `/host/${state.program}/session/${state.session}/requests`, 'host-requests');
    await H.page.getByTestId(`request-${player.id}-approve`).click();
    await H.page.getByTestId(`request-${player.id}-done`).filter({ hasText: 'is in and has been told' }).waitFor();
    await until('approved on the server', async () => {
      const { data } = await admin.from('host_join_requests').select('status').eq('session_id', state.session).eq('user_id', player.id);
      return data?.[0]?.status === 'approved';
    });
    await H.page.getByTestId(`request-${player.id}-undo`).click();
    await H.page.getByTestId(`request-${player.id}-approve`).waitFor();
    await until('back to pending', async () => {
      const { data } = await admin.from('host_join_requests').select('status').eq('session_id', state.session).eq('user_id', player.id);
      return data?.[0]?.status === 'pending';
    });
    await H.page.getByTestId(`request-${player.id}-approve`).click();
    await H.page.getByTestId(`request-${player.id}-done`).waitFor();
    await H.page.getByTestId('requests-count').filter({ hasText: '1 / 4 IN' }).waitFor({ timeout: 20_000 });
  });

  await step('HostRoster: the player is in, with the count, check-in note and payment words', async () => {
    await open(H.page, `/host/${state.program}/session/${state.session}`, 'host-roster');
    await H.page.getByTestId(`roster-in-${player.id}`).waitFor({ timeout: 20_000 });
    const count = await H.page.getByTestId('roster-count').innerText();
    assert(/1 \/ 4 IN/.test(count), `count ${count}`);
    await H.page.getByText(/Check-in opens at/).waitFor();
    // $8 drop-in: the ledger says how it's paid, or that payments aren't connected. Never colour only.
    const settle = await H.page.getByTestId('roster-settlement').innerText();
    assert(/settled|connected/i.test(settle), `settlement ${settle}`);
    assert((await H.page.getByTestId('roster-add-spot').innerText()).includes('ADD A 5TH SPOT'), 'add a 5th spot');
  });

  await step('HostSeries: change the level and players, save; the server has it', async () => {
    await open(H.page, `/host/${state.program}/series/${state.series}`, 'host-series');
    await H.page.getByTestId('series-level-competitive').click();
    await H.page.getByRole('button', { name: /One more|more/i }).first().click().catch(() => {});
    await H.page.getByTestId('series-save').click();
    await until('saved', async () => {
      const { data } = await admin.from('host_series').select('level, version').eq('id', state.series);
      return data?.[0]?.level === 'competitive';
    }, 20_000);
    await H.page.waitForURL((u) => !u.pathname.includes('/series/'), { timeout: 20_000 });
  });

  await step('HostSeries: skip a session nobody is in, then restore it', async () => {
    await open(H.page, `/host/${state.program}/series/${state.series}`, 'host-series');
    const sessions = await host.call('series_sessions', { p_series_id: state.series, p_limit: 4 });
    const empty = sessions.find((s) => s.status === 'scheduled' && s.in_count === 0 && new Date(s.starts_at) > new Date());
    assert(empty, 'an empty upcoming session');
    await H.page.getByTestId(`series-session-${empty.occurs_on}-skip`).click();
    await H.page.getByTestId(`series-session-${empty.occurs_on}-restore`).waitFor({ timeout: 20_000 });
    await until('skipped on the server', async () => {
      const { data } = await admin.from('host_sessions').select('status').eq('id', empty.session_id);
      return data?.[0]?.status === 'skipped';
    });
    await H.page.getByTestId(`series-session-${empty.occurs_on}-restore`).click();
    await H.page.getByTestId(`series-session-${empty.occurs_on}-skip`).waitFor({ timeout: 20_000 });
    await until('restored on the server', async () => {
      const { data } = await admin.from('host_sessions').select('status').eq('id', empty.session_id);
      return data?.[0]?.status === 'scheduled';
    });
  });

  await step('HostSeries: skipping a session people are in asks for a reason, shows it, and restores', async () => {
    await open(H.page, `/host/${state.program}/series/${state.series}`, 'host-series');
    const sessions = await host.call('series_sessions', { p_series_id: state.series, p_limit: 4 });
    const ours = sessions.find((s) => s.session_id === state.session);
    assert(ours && ours.in_count > 0, 'our session with the player in is among the next 4');
    await H.page.getByTestId(`series-session-${ours.occurs_on}-skip`).click();
    await H.page.getByTestId('skip-reason').fill('Field booked for a tournament');
    await H.page.getByTestId('skip-confirm').click();
    await H.page.getByTestId(`series-session-${ours.occurs_on}`).filter({ hasText: 'Field booked for a tournament' }).waitFor({ timeout: 20_000 });
    await until('skipped with the reason', async () => {
      const { data } = await admin.from('host_sessions').select('status, skip_reason').eq('id', state.session);
      return data?.[0]?.status === 'skipped' && data[0].skip_reason === 'Field booked for a tournament';
    });
    await H.page.getByTestId(`series-session-${ours.occurs_on}-restore`).click();
    await until('restored', async () => {
      const { data } = await admin.from('host_sessions').select('status').eq('id', state.session);
      return data?.[0]?.status === 'scheduled';
    }, 20_000);
  });

  await step('a non-host opening a host link gets the not-allowed page, not a crash', async () => {
    await open(J.page, `/host/${state.program}`, 'host-not-allowed');
    await open(J.page, `/host/${state.program}/session/${state.session}`, 'host-not-allowed');
  });
} catch (error) {
  exitCode = 1;
  if (process.env.E2E_SHOTS) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(process.env.E2E_SHOTS, `host-fail-${i}.png`) }).catch(() => {});
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
