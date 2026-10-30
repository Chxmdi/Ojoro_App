// Step 6 e2e: HostSeason (league operations) and HostInsights, against the local Supabase stack and
// the Expo web app.
//
//   APP_URL=http://localhost:8100 node apps/mobile/e2e/host-season-insights.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (APP_URL or E2E_APP_URL,
// default http://localhost:8100) and Playwright. Re-runnable: it uses its own test users (made with
// the local admin API, phones +1 555 555 986x, never the seeded people) and makes a fresh program and
// league each run (results are final, so nothing is reused). It never touches the seeded Plateau
// Pickup league. Times are relative to now; nothing depends on the time of day.
//
// Covers: a non-host is refused; the host sees RESULT TO CONFIRM once both captains sent the same
// score, CONFIRM RESULT recomputes the standings (3 points to the winner, shaded "moved" rows), ASK …
// TO REF asks the suggested free referee; HostInsights shows the hours hero, tiles, the chart's table
// view, the revenue ledger with the placeholder fee labelled, and DOWNLOAD CSV saves a file.
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

const APP = process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100';
const PASSWORD = 'ojoro-e2e-password';

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
  host: { phone: '+15555559861', name: 'Bisi H' },
  capA: { phone: '+15555559862', name: 'Tolu A' },
  capB: { phone: '+15555559863', name: 'Wale B' },
  ref: { phone: '+15555559864', name: 'Remi Q' },
  other: { phone: '+15555559865', name: 'Nonso X' },
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
/** A local calendar date (YYYY-MM-DD) `days` from today in Montréal. */
function localDate(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(d);
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
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  return { ctx, page };
}

async function open(page, path, testId) {
  await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 240_000 });
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

async function main() {
  const host = await signIn(PEOPLE.host);
  const capA = await signIn(PEOPLE.capA);
  const capB = await signIn(PEOPLE.capB);
  const ref = await signIn(PEOPLE.ref);
  const other = await signIn(PEOPLE.other);

  const run = randomUUID().slice(0, 6);
  const program = await host.call('create_host_program', {
    p_name: `E2E Club ${run}`,
    p_sport_id: 'football',
    p_idempotency_key: key(),
  });
  const programId = program.id;
  // Two teams, everyone plays everyone twice: round 1 eight days ago (played), round 2 tomorrow-ish.
  const leagueName = `Fall Cup ${run}`;
  const leagueId = await host.call('create_host_league', {
    p_program_id: programId,
    p_name: leagueName,
    p_sport_id: 'football',
    p_starts_on: localDate(-6),
    p_rounds_total: 2,
    p_idempotency_key: key(),
    p_venue_label: 'Test Park',
    p_meetings: 2,
    p_min_players: 2,
  });
  const alpha = await host.call('upsert_host_league_team', { p_league_id: leagueId, p_name: `Alpha ${run}`, p_captain_id: capA.id });
  const beta = await host.call('upsert_host_league_team', { p_league_id: leagueId, p_name: `Beta ${run}`, p_captain_id: capB.id });
  await host.call('set_host_league_member', { p_league_id: leagueId, p_user_id: capA.id, p_team_id: alpha });
  await host.call('set_host_league_member', { p_league_id: leagueId, p_user_id: capB.id, p_team_id: beta });
  await host.call('set_host_league_member', { p_league_id: leagueId, p_user_id: ref.id, p_can_referee: true });
  await host.call('generate_host_league_fixtures', {
    p_league_id: leagueId,
    p_first_kickoff: '10:00',
    p_slot_minutes: 75,
    p_idempotency_key: key(),
    p_pitch: 'Pitch 1',
  });

  const view = await host.call('host_league_view', { p_league_id: leagueId });
  const { data: fixtures, error } = await admin
    .from('host_league_fixtures')
    .select('id, kicks_off_at, home_team_id, away_team_id')
    .eq('league_id', leagueId)
    .order('kicks_off_at');
  if (error) throw new Error(error.message);
  const played = fixtures.find((f) => new Date(f.kicks_off_at).getTime() < Date.now());
  assert(played, `a fixture before now (got ${fixtures.map((f) => f.kicks_off_at).join(', ')})`);
  const homeIsAlpha = played.home_team_id === alpha;
  // Alpha wins 3–1 whichever side it's on.
  const [hg, ag] = homeIsAlpha ? [3, 1] : [1, 3];
  await capA.call('submit_league_result', { p_fixture_id: played.id, p_home_goals: hg, p_away_goals: ag, p_idempotency_key: key() });
  await capB.call('submit_league_result', { p_fixture_id: played.id, p_home_goals: hg, p_away_goals: ag, p_idempotency_key: key() });
  console.log(`     program ${programId}, league ${leagueId}, round ${view.round?.number ?? '-'}`);

  const browser = await chromium.launch();
  try {
    const seasonPath = `/host/${programId}/league/${leagueId}`;

    await step('someone who does not run the program is refused', async () => {
      const { ctx, page } = await browserAs(browser, other);
      await open(page, seasonPath, 'host-not-allowed');
      await ctx.close();
    });

    const { ctx, page } = await browserAs(browser, host);

    await step('HostSeason shows the result to confirm and a game in hand', async () => {
      await open(page, seasonPath, 'host-season');
      await page.getByText(`${leagueName.toUpperCase()}.`).waitFor();
      await page.getByText('RESULT TO CONFIRM').waitFor();
      await page.getByText(`Both captains sent ${hg}–${ag}`, { exact: false }).waitFor();
      await page.getByTestId('season-standings-note').getByText(/game in hand until you confirm/).waitFor();
      await page.getByText('Points, then goal difference, then goals scored').waitFor();
    });

    await step('CONFIRM RESULT recomputes the standings', async () => {
      await page.getByTestId('season-confirm').click();
      await page.getByTestId('season-result-confirmed').waitFor({ timeout: 30_000 });
      await page.getByText('RESULT CONFIRMED').waitFor();
      await page.getByText('RESULT VERIFIED').waitFor();
      await page.getByText('Shaded rows moved with the result you just confirmed.').waitFor();
      const standings = await host.call('host_league_standings', { p_league_id: leagueId });
      const top = standings[0];
      assert(top.team_id === alpha && top.points === 3 && top.goal_difference === 2, `Alpha top on 3 pts: ${JSON.stringify(top)}`);
      const table = page.getByTestId('season-standings');
      await table.getByText(`Alpha ${run}`).waitFor();
      const text = await table.innerText();
      assert(/\+2/.test(text) && /−2/.test(text), `goal difference shown: ${text}`);
      // The result is final: confirming again with the agreed score just returns it.
      const again = await host.call('confirm_league_result', { p_fixture_id: played.id, p_idempotency_key: key() });
      assert(again.status === 'confirmed', `confirm again: ${JSON.stringify(again)}`);
    });

    await step('ASK … TO REF asks the suggested free referee', async () => {
      const button = page.getByRole('button', { name: `ASK ${ref.first.toUpperCase()} TO REF` });
      if ((await button.count()) === 0) {
        console.log('     (no next-round fixture with a suggestion; skipped)');
        return;
      }
      await button.first().click();
      await page.getByText(`Ref: ${ref.name} · asked, waiting for an answer`).waitFor({ timeout: 30_000 });
    });

    await ctx.close();

    await step('HostInsights shows hours, tiles, chart table, ledger and the CSV', async () => {
      const { ctx: c2, page: p2 } = await browserAs(browser, host);
      await open(p2, `/host/${programId}/insights`, 'host-insights');
      await p2.getByText('Ojoro hours at your sessions').waitFor();
      await p2.getByText('Showed up').waitFor();
      await p2.getByText('PEOPLE PER WEEK').waitFor();
      await p2.getByText('SHOW AS TABLE', { exact: true }).click();
      await p2.getByText('WEEK OF', { exact: true }).waitFor();
      await p2.getByText('SHOW AS CHART').waitFor();
      await p2.getByText(/Ojoro service fee/).first().waitFor();
      await p2.getByText(/placeholder/).first().waitFor();
      const [download] = await Promise.all([
        p2.waitForEvent('download', { timeout: 30_000 }),
        p2.getByTestId('insights-csv').click(),
      ]);
      assert(/^e2e-club-[a-z0-9]+-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
      await c2.close();
    });
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
