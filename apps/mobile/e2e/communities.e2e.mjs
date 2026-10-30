// Step 6 e2e: Crew Home, Clan and Ojoro Clash against the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/communities.e2e.mjs
//
// Needs: `npx supabase start` (local stack with the Step 6 migrations), the Expo web dev server
// (APP_URL or E2E_APP_URL, default http://localhost:8100) and Playwright. Re-runnable: it uses its own
// two test users (made with the local admin API, phones +1 555 555 988x, never the seeded people),
// moves their earlier crews and clans back two days so the daily limits never trip, and makes a fresh
// crew, two fresh clans and a fresh Clash every run. Assertions never depend on global counts or the
// time of day.
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
  a: { phone: '+15555559881', name: 'Nia C' },
  b: { phone: '+15555559882', name: 'Obi D' },
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

const key = () => randomUUID();
/** A start some days out, on the half hour. */
const inDays = (d) => new Date(Math.ceil((Date.now() + d * 86_400_000) / 1_800_000) * 1_800_000).toISOString();

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


async function main() {
  const A = await signIn(PEOPLE.a);
  const B = await signIn(PEOPLE.b);
  // Leftovers: no blocks between us; older e2e crews and clans out of the daily limits.
  await admin.from('blocks').delete().or(`and(blocker_id.eq.${A.id},blocked_id.eq.${B.id}),and(blocker_id.eq.${B.id},blocked_id.eq.${A.id})`);
  const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
  for (const p of [A, B]) {
    await admin.from('crews').update({ created_at: old }).eq('created_by', p.id);
    await admin.from('clans').update({ created_at: old }).eq('created_by', p.id);
  }

  const browser = await chromium.launch();
  const pa = await browserAs(browser, A);
  const pb = await browserAs(browser, B);
  const tag = String(Date.now() % 100000);
  let crewId;
  let clanX;
  let clanY;
  let clashId;
  let runId;

  try {
    await step('Crew Home: momentum, free tonight as overlap, CALL OUT for the owner, the code', async () => {
      const crew = await A.call('create_crew', { p_idempotency_key: key(), p_name: `E2E Home ${tag}`, p_sport_id: 'running' });
      crewId = crew.id;
      const code = await A.call('crew_invite_code', { p_crew_id: crewId });
      await B.call('join_crew', { p_code: code });
      await open(pa.page, `/crew/${crewId}`, 'crew-screen');
      await pa.page.getByTestId('crew-momentum').waitFor();
      await pa.page.getByText(/RHYTHM · 8 WEEKS/).first().waitFor();
      await pa.page.getByText("Shown as overlap only. Nobody's calendar is visible.").waitFor();
      await pa.page.getByTestId('crew-call-out').waitFor();
      const shown = (await pa.page.getByTestId('crew-code').innerText()).trim();
      assert(shown === code, `code ${shown} vs ${code}`);
      await pa.page.getByTestId('crew-down-for').waitFor();
      await pa.page.getByTestId('crew-versus-empty').waitFor();
    });

    await step('a member sees no CALL OUT and no code', async () => {
      await open(pb.page, `/crew/${crewId}`, 'crew-screen');
      await pb.page.getByTestId('crew-chat').waitFor();
      assert((await pb.page.getByTestId('crew-call-out').count()) === 0, 'member sees CALL OUT');
      assert((await pb.page.getByTestId('crew-code').count()) === 0, 'member sees the code');
    });

    await step('OPEN CREW CHAT counts new messages, and opening the chat clears them', async () => {
      await B.call('send_message', { p_crew_id: crewId, p_body: 'Running Saturday?', p_idempotency_key: key() });
      await B.call('send_message', { p_crew_id: crewId, p_body: 'Anyone', p_idempotency_key: key() });
      await until('2 NEW on Crew Home', async () => /· 2 NEW/.test(await pa.page.getByTestId('crew-chat').innerText()), 30_000);
      await pa.page.getByTestId('crew-chat').click();
      await pa.page.getByTestId('chat-composer').waitFor({ timeout: 60_000 });
      await until('read mark', async () => ((await A.call('crew_home', { p_crew_id: crewId }))[0].unread_count === 0));
      await open(pa.page, `/crew/${crewId}`, 'crew-screen');
      await until('no NEW', async () => (await pa.page.getByTestId('crew-chat').innerText()).trim() === 'OPEN CREW CHAT', 30_000);
    });

    await step('Clan: someone outside joins an open clan; roles show the captain', async () => {
      const x = await A.call('create_clan', {
        p_idempotency_key: key(),
        p_name: `E2E Striders ${tag}`,
        p_short_name: 'STRIDERS',
        p_join_policy: 'open',
        p_tagline: 'Two runs a week. Every pace.',
        p_sport_id: 'running',
        p_area: 'Plateau',
        p_city: 'Montréal',
      });
      clanX = x.id;
      await open(pb.page, `/clan/${clanX}`, 'clan-screen');
      await pb.page.getByText('CLAN · OPEN TO JOIN').waitFor();
      await pb.page.getByTestId('clan-join').click();
      await pb.page.getByText("CLAN · YOU'RE IN").waitFor({ timeout: 30_000 });
      const view = (await B.call('clan_view', { p_clan_id: clanX }))[0];
      assert(view.is_member && view.member_count === 2, `clan_view ${JSON.stringify(view)}`);
      await pb.page.getByTestId(`clan-role-${A.id}`).getByText('CAPTAIN').waitFor();
      await pb.page.getByTestId('clan-leaderboard').waitFor();
    });

    await step("Clan: a club run this week, I'M DOWN from the page", async () => {
      const run = await A.call('create_clan_run', {
        p_idempotency_key: key(),
        p_clan_id: clanX,
        p_sport_id: 'running',
        p_title: 'Easy 5 km',
        p_starts_at: inDays(2),
        p_capacity: 20,
        p_min_to_go: 4,
        p_distance_km: 5,
      });
      runId = run.run_id;
      await open(pb.page, `/clan/${clanX}`, 'clan-screen');
      await pb.page.getByTestId(`clan-run-join-${runId}`).click();
      await until('down in the run', async () => (await B.call('clan_run_view', { p_run_id: runId }))[0]?.i_am_down === true);
      await pb.page.getByTestId(`clan-run-${runId}`).getByText("YOU'RE DOWN").waitFor({ timeout: 20_000 });
    });

    await step('Clash: proposed, accepted, then the poster puts your clan first', async () => {
      const y = await B.call('create_clan', { p_idempotency_key: key(), p_name: `E2E Hares ${tag}`, p_short_name: 'HARES', p_join_policy: 'request', p_sport_id: 'running' });
      clanY = y.id;
      // B is in both clans now; leave X so each side is one clan's people.
      await B.call('leave_clan', { p_clan_id: clanX });
      const state = await A.call('create_clash', {
        p_idempotency_key: key(),
        p_clan_id: clanX,
        p_opponent_clan_id: clanY,
        p_title: 'E2E Clash',
        p_season_label: 'Test season',
        p_events: [
          { title: '5K', sport_id: 'running', scoring: 'time', starts_at: inDays(3), squad_size: 5 },
          { title: 'Relay', sport_id: 'running', scoring: 'time', starts_at: inDays(5) },
        ],
      });
      clashId = state.clash_id;
      await B.call('accept_clash', { p_clash_id: clashId });
      await open(pb.page, `/clash/${clashId}`, 'clash-screen');
      await pb.page.getByText('OJORO CLASH · TEST SEASON').waitFor();
      const poster = await pb.page.getByTestId('clash-poster').innerText();
      assert(poster.indexOf('HARES') < poster.indexOf('STRIDERS'), `poster order: ${poster}`);
      await pb.page.getByTestId('clash-event-1').getByText('UPCOMING').waitFor();
    });

    await step('Clash: YOUR PART joins a squad; backing your own clan counts, the other side never', async () => {
      await pb.page.getByTestId('clash-my-part-down').click();
      await until('in the squad', async () => (await B.call('clash_my_part', { p_clash_id: clashId }))[0]?.i_am_in === true);
      await pb.page.getByTestId('clash-my-part').getByText("You're in the running squad", { exact: false }).waitFor({ timeout: 20_000 });
      await pb.page.getByRole('button', { name: /^Back Hares/i }).click();
      await until('backing', async () => (await B.call('clash_view', { p_clash_id: clashId }))[0]?.my_backing === 'b');
      await pb.page.getByRole('button', { name: /^Back Striders/i }).click();
      await pb.page.getByText('You can back your own clan.').first().waitFor();
      const v = (await B.call('clash_view', { p_clash_id: clashId }))[0];
      assert(v.my_backing === 'b' && v.backing_a === 0, `backing ${JSON.stringify(v)}`);
    });

    await step('Clan shows its Clash; You lists crews and clans', async () => {
      await open(pa.page, `/clan/${clanX}`, 'clan-screen');
      await pa.page.getByTestId(`clan-clash-${clashId}`).click();
      await pa.page.waitForURL(new RegExp(`/clash/${clashId}$`), { timeout: 30_000 });
      await open(pa.page, '/you', 'your-crews');
      await pa.page.getByTestId(`your-crew-${crewId}`).waitFor({ timeout: 30_000 });
      await pa.page.getByTestId(`your-clan-${clanX}`).waitFor();
    });
  } finally {
    if (clashId) await A.call('cancel_clash', { p_clash_id: clashId }).catch(() => {});
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
