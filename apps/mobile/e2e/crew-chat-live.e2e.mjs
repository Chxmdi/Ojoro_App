// Step 4 e2e: crews, crew chat, Make This a Game, and the live page, against the local Supabase
// stack and the Expo web app, with three people in three browser contexts.
//
//   node apps/mobile/e2e/crew-chat-live.e2e.mjs
//
// Needs: `npx supabase start` (local stack), the Expo web dev server (E2E_APP_URL, default
// http://localhost:8100) and Playwright. Re-runnable: it uses its own three test users (made with
// the local admin API, phones +1 555 555 983x, never the seeded people), starts a fresh crew and a
// fresh game every run (older e2e crews are moved back a day so the 5-a-day limit never trips),
// and cancels or ends what it made.
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

const APP = process.env.E2E_APP_URL ?? 'http://localhost:8100';
const PASSWORD = 'ojoro-e2e-password';
const PLACE = { lat: 45.5165, lng: -73.5862 }; // Jeanne-Mance Park (seed)

// ---------------------------------------------------------------------------------------------
// Supabase

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
  owner: { phone: '+15555559831', name: 'Tobi E' },
  member: { phone: '+15555559832', name: 'Uche N' },
  third: { phone: '+15555559833', name: 'Ife K' },
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
const inMinutes = (m) => new Date(Math.ceil((Date.now() + m * 60_000) / 60_000) * 60_000).toISOString();

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
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    geolocation: { latitude: PLACE.lat, longitude: PLACE.lng },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${person.first}]`, e.message));
  page.on('requestfailed', (r) => {
    if (process.env.E2E_DEBUG && r.url().includes('/rest/v1/')) {
      console.log(`  [requestfailed ${person.first}]`, r.method(), r.url().split('/rest/v1/')[1], r.failure()?.errorText);
    }
  });
  if (process.env.E2E_DEBUG) {
    page.on('console', (m) => {
      if (/offline|network|analytics\] make/i.test(m.text())) console.log(`  [console ${person.first}]`, m.text().slice(0, 200));
    });
  }
  return { ctx, page };
}

async function open(page, path, testId) {
  // The shared dev server can take a while to serve a page; give it room.
  await page.goto(`${APP}${path}`, { waitUntil: 'load', timeout: 180_000 });
  if (testId) await page.getByTestId(testId).first().waitFor({ timeout: 60_000 });
}

/** Types into the chat composer and taps send. */
async function sendInChat(page, text) {
  const field = page.getByPlaceholder(/^Message /);
  await field.fill(text);
  await page.getByTestId('chat-composer-send').click();
}

/** A long press on a message (RN Pressable's onLongPress on web). */
async function longPress(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('message not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(900);
  await page.mouse.up();
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

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch();
const cleanup = [];
let exitCode = 0;
const contexts = [];

try {
  const owner = await signIn(PEOPLE.owner);
  const member = await signIn(PEOPLE.member);
  const third = await signIn(PEOPLE.third);
  // Leftovers from an earlier run: no blocks between us, and older e2e crews out of the 24 h limit.
  await third.call('unblock_user', { p_user_id: member.id }).catch(() => {});
  await admin
    .from('crews')
    .update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    .eq('created_by', owner.id);

  const A = await browserAs(browser, owner);
  const B = await browserAs(browser, member);
  const C = await browserAs(browser, third);
  contexts.push(A.ctx, B.ctx, C.ctx);
  const crewName = `E2E Crew ${Date.now() % 100000}`;
  let crewId;
  let code;

  // 1. Crews -------------------------------------------------------------------------------------
  await step('create a crew (START A CREW): name, usual sport, then the crew page with its code', async () => {
    await open(A.page, '/crew', 'crews-screen');
    await A.page.getByTestId('crews-start').click();
    await A.page.getByTestId('crew-new').waitFor({ timeout: 20_000 });
    await A.page.getByLabel(/crew name/i).fill(crewName);
    await A.page.getByText('Football', { exact: true }).first().click();
    await A.page.getByTestId('crew-new-submit').click();
    await A.page.waitForURL(/\/crew\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    crewId = /\/crew\/([0-9a-f-]{36})/.exec(A.page.url())[1];
    code = (await A.page.getByTestId('crew-code').innerText({ timeout: 20_000 })).trim();
    assert(/^[A-Z2-9]{8}$/.test(code), `unexpected code ${code}`);
    const view = (await owner.call('crew_view', { p_crew_id: crewId }))[0];
    assert(view.my_role === 'owner' && view.sport_id === 'football', `crew_view: ${JSON.stringify(view)}`);
  });

  await step('a second and a third person join by code', async () => {
    for (const P of [B, C]) {
      await open(P.page, '/crew/join', 'crew-join');
      await P.page.getByLabel(/invite code/i).fill(code.toLowerCase());
      await P.page.getByTestId('crew-join-submit').click();
      await P.page.waitForURL(new RegExp(`/crew/${crewId}/chat$`), { timeout: 20_000 });
    }
    const view = (await owner.call('crew_view', { p_crew_id: crewId }))[0];
    assert(view.member_count === 3, `expected 3 members, got ${view.member_count}`);
    // A wrong code is words, not a crash.
    await open(C.page, '/crew/join', 'crew-join');
    await C.page.getByLabel(/invite code/i).fill('ZZZZZZZZ');
    await C.page.getByTestId('crew-join-submit').click();
    await C.page.getByText("That invite code doesn't work.").waitFor({ timeout: 15_000 });
  });

  // 2. Chat --------------------------------------------------------------------------------------
  await step('messages arrive in realtime both ways', async () => {
    await open(A.page, `/crew/${crewId}/chat`, 'chat-composer');
    await open(B.page, `/crew/${crewId}/chat`, 'chat-composer');
    await A.page.getByTestId('crew-caption').waitFor();
    const fromA = `Hello from ${owner.first} ${Date.now() % 1000}`;
    await sendInChat(A.page, fromA);
    await B.page.getByText(fromA).waitFor({ timeout: 15_000 });
    const fromB = `Hey ${owner.first}, ${Date.now() % 1000}`;
    await sendInChat(B.page, fromB);
    await A.page.getByText(fromB).waitFor({ timeout: 15_000 });
  });

  await step('a double-tap on send posts once', async () => {
    const body = `Only once ${Date.now() % 10000}`;
    await A.page.getByPlaceholder(/^Message /).fill(body);
    await A.page.getByTestId('chat-composer-send').dblclick();
    await A.page.getByTestId('chat-composer-send').click({ force: true }).catch(() => {});
    await B.page.getByText(body).waitFor({ timeout: 15_000 });
    await sleep(1500);
    const rows = await owner.call('crew_messages', { p_crew_id: crewId, p_limit: 50 });
    const count = rows.filter((m) => m.body === body).length;
    assert(count === 1, `expected 1 message, found ${count}`);
  });

  await step('report a message from the long-press sheet', async () => {
    const target = B.page.getByText(/^Hello from /).first();
    await longPress(B.page, target);
    await B.page.getByTestId('message-report').click({ timeout: 10_000 });
    await B.page.getByTestId('report-reason-spam').click({ timeout: 10_000 });
    await B.page.getByTestId('report-block-send').click();
    await B.page.getByTestId('report-block-sent').waitFor({ timeout: 15_000 });
    await B.page.getByTestId('report-block-done').click();
  });

  // 3. Make This a Game --------------------------------------------------------------------------
  let suggestionId;
  await step('a chat line about a game produces a suggestion', async () => {
    await open(C.page, `/crew/${crewId}/chat`, 'chat-composer');
    await sendInChat(A.page, "Football tomorrow evening? Who's in");
    await sendInChat(B.page, "I'm in, tomorrow evening works");
    await A.page.getByTestId('game-suggestion').waitFor({ timeout: 20_000 });
    await B.page.getByTestId('game-suggestion').waitFor({ timeout: 20_000 });
    await C.page.getByTestId('game-suggestion').waitFor({ timeout: 20_000 });
    const title = await A.page.getByTestId('game-suggestion').innerText();
    assert(/FOOTBALL, TOMORROW EVENING\?/.test(title), `title: ${title}`);
    const rows = await owner.call('chat_suggestions', { p_crew_id: crewId });
    suggestionId = rows.find((r) => r.status === 'open')?.id;
    assert(suggestionId, 'an open suggestion');
  });

  await step('NOT NOW hides it for one person only', async () => {
    await C.page.getByTestId('game-suggestion').getByText('NOT NOW', { exact: true }).click();
    await C.page.getByTestId('game-suggestion').waitFor({ state: 'detached', timeout: 15_000 });
    await C.page.reload({ waitUntil: 'load', timeout: 180_000 });
    await C.page.getByTestId('chat-composer').waitFor({ timeout: 30_000 });
    await sleep(2500);
    assert((await C.page.getByTestId('game-suggestion').count()) === 0, 'still hidden after a reload');
    assert((await B.page.getByTestId('game-suggestion').count()) === 1, 'still there for the others');
    const forB = await member.call('chat_suggestions', { p_crew_id: crewId });
    assert(forB.some((r) => r.id === suggestionId && r.status === 'open'), 'open for B on the server');
  });

  let planId;
  await step('MAKE THIS A GAME asks what is missing and creates exactly one crew plan with a poll', async () => {
    const plansBefore = (await admin.from('plans').select('id').eq('crew_id', crewId)).data ?? [];
    assert(plansBefore.length === 0, 'nothing is created before the tap');
    await A.page.getByTestId('game-suggestion').getByText('MAKE THIS A GAME', { exact: true }).click();
    await A.page.getByTestId('make-game-confirm').waitFor({ timeout: 10_000 });
    assert((await A.page.getByTestId('make-game-place-later').count()) === 1, 'the place can be agreed later');
    await A.page.getByTestId('make-game-place-later').click();
    await A.page.getByTestId('make-game-confirm').dblclick();
    await A.page.getByTestId('time-poll').waitFor({ timeout: 20_000 });
    await B.page.getByTestId('time-poll').waitFor({ timeout: 20_000 });
    const plans = (await admin.from('plans').select('id,source,audience').eq('crew_id', crewId)).data ?? [];
    assert(plans.length === 1, `expected 1 crew plan, found ${plans.length}`);
    assert(plans[0].source === 'chat' && plans[0].audience === 'crew', JSON.stringify(plans[0]));
    planId = plans[0].id;
    cleanup.push(() => owner.call('cancel_plan', { p_plan_id: planId }));
    const options = (await admin.from('plan_time_options').select('id').eq('plan_id', planId)).data ?? [];
    assert(options.length >= 2, `a poll needs 2+ times, got ${options.length}`);
    await A.page.getByTestId('chat-system').filter({ hasText: 'tapped MAKE THIS A GAME' }).first().waitFor();
  });

  await step('votes count: a crew member who is not in the plan votes, and everyone sees it', async () => {
    const poll = B.page.getByTestId('time-poll');
    await poll.getByRole('radio').first().click();
    await until('the vote to be stored', async () => {
      const { data } = await admin.from('plan_time_votes').select('user_id').eq('plan_id', planId);
      return (data ?? []).some((v) => v.user_id === member.id);
    });
    await A.page.getByTestId('time-poll').getByText(/1 vote/).first().waitFor({ timeout: 15_000 });
  });

  await step("a blocked person's messages are hidden for the blocker", async () => {
    await third.call('block_user', { p_user_id: member.id });
    cleanup.push(() => third.call('unblock_user', { p_user_id: member.id }));
    await C.page.reload({ waitUntil: 'load', timeout: 180_000 });
    await C.page.getByTestId('chat-hidden').first().waitFor({ timeout: 30_000 });
    assert((await C.page.getByText("I'm in, tomorrow evening works").count()) === 0, 'blocked words hidden');
    assert((await C.page.getByText(/^Hello from /).count()) > 0, "the owner's messages still show");
  });

  // 4. Live --------------------------------------------------------------------------------------
  let gameId;
  await step('live game: a public plan of 2 locks, both check in, the host starts it', async () => {
    const { data: placeRow } = await owner.client.from('places').select('id').eq('name', 'Jeanne-Mance Park').single();
    const plan = await owner.call('create_plan', {
      p_idempotency_key: key(),
      p_sport_id: 'football',
      p_starts_at: inMinutes(20),
      p_capacity: 2,
      p_place_id: placeRow.id,
      p_title: 'E2E live football',
      p_team_a_label: 'Lights',
      p_team_b_label: 'Darks',
    });
    const locked = await member.call('im_down', { p_plan_id: plan.plan_id, p_idempotency_key: key() });
    assert(locked.status === 'game_on', `expected GAME ON, got ${locked.status}`);
    gameId = locked.activity_id;
    cleanup.push(() => owner.call('end_activity', { p_activity_id: gameId }));
    for (const p of [owner, member]) {
      await p.call('check_in', { p_activity_id: gameId, p_lat: PLACE.lat, p_lng: PLACE.lng, p_idempotency_key: key() });
    }
    await owner.call('start_activity', { p_activity_id: gameId });
  });

  await step('the Activity screen links to the live page and the game chat', async () => {
    await open(B.page, `/activity/${gameId}`, 'activity-screen');
    await B.page.getByTestId('open-chat').waitFor({ timeout: 15_000 });
    await B.page.getByTestId('open-live').click();
    await B.page.waitForURL(new RegExp(`/activity/${gameId}/live$`), { timeout: 15_000 });
    await B.page.getByTestId('live-score').waitFor({ timeout: 20_000 });
  });

  await step('a follower follows; the host logs a score and the follower sees it with a fresh Updated line', async () => {
    await open(C.page, `/activity/${gameId}/live`, 'live-score');
    await C.page.getByTestId('live-follow').click();
    await until('C to follow', async () => (await third.call('activity_live', { p_activity_id: gameId }))[0].i_follow);
    await open(A.page, `/activity/${gameId}/live`, 'live-log-score');
    await A.page.getByTestId('live-log-score').click();
    await A.page.getByRole('button', { name: /increase lights/i }).click();
    await A.page.getByRole('button', { name: /increase lights/i }).click();
    await A.page.getByRole('button', { name: /increase darks/i }).click();
    await A.page.getByTestId('log-score-save').click();
    await C.page.getByTestId('live-score').getByText('2', { exact: true }).first().waitFor({ timeout: 15_000 });
    await until('the follower to see 2–1', async () => {
      const label = await C.page.getByLabel(/^Score: /).first().getAttribute('aria-label');
      return /Lights 2, Darks 1/.test(label ?? '');
    });
    const line = await C.page.getByTestId('live-score').innerText();
    assert(/Updated (just now|\d+ s ago)/.test(line) && /logged by Tobi \(host\)/.test(line), `freshness: ${line}`);
    await C.page.getByTestId('live-update-score').first().waitFor({ timeout: 15_000 });
    const live = (await owner.call('activity_live', { p_activity_id: gameId }))[0];
    assert(live.team_a_score === 2 && live.team_b_score === 1, `server score ${live.team_a_score}-${live.team_b_score}`);
    // Same value again changes nothing (idempotent per value).
    const before = (await owner.call('activity_updates_feed', { p_activity_id: gameId })).length;
    await owner.call('log_score', { p_activity_id: gameId, p_team_a: 2, p_team_b: 1 });
    const after = (await owner.call('activity_updates_feed', { p_activity_id: gameId })).length;
    assert(before === after, 'logging the same score posts nothing');
  });

  await step('reactions toggle and count once', async () => {
    const letsGo = C.page.getByTestId('live-reactions').getByRole('button', { name: /^Let’s go/ });
    const count = async () => {
      const r = (await third.call('activity_live', { p_activity_id: gameId }))[0];
      return { n: r.reaction_counts?.lets_go ?? 0, mine: r.my_reaction };
    };
    await letsGo.click();
    await until('one LET’S GO', async () => {
      const c = await count();
      return c.n === 1 && c.mine === 'lets_go';
    });
    await C.page.getByTestId('live-reactions').getByRole('button', { name: /^Let’s go, 1, you reacted/ }).waitFor({ timeout: 10_000 });
    await letsGo.click();
    await until('LET’S GO taken back', async () => {
      const c = await count();
      return c.n === 0 && c.mine === null;
    });
  });

  await step('FULL TIME (host, confirmed) ends the game and opens After', async () => {
    await A.page.getByTestId('live-full-time-button').click();
    await A.page.getByRole('button', { name: 'FULL TIME', exact: true }).last().click();
    await A.page.waitForURL(new RegExp(`/activity/${gameId}/after$`), { timeout: 20_000 });
    const { data } = await owner.client.from('activity_cards').select('effective_status').eq('id', gameId).single();
    assert(data.effective_status === 'after', `expected after, got ${data.effective_status}`);
    await C.page.getByTestId('live-finished').waitFor({ timeout: 20_000 });
  });
} catch (error) {
  exitCode = 1;
  // E2E_SHOTS=<dir> keeps a screenshot of each person's page at the failure.
  if (process.env.E2E_SHOTS) {
    for (const [i, ctx] of contexts.entries()) {
      await ctx.pages()[0]?.screenshot({ path: join(process.env.E2E_SHOTS, `fail-${i}.png`) }).catch(() => {});
    }
  }
  if (!results.length || results.at(-1).ok) console.log('FAIL setup\n    ', error.message);
} finally {
  for (const undo of cleanup.reverse()) {
    try {
      await undo();
    } catch {
      // Already finished; nothing left forming.
    }
  }
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} steps passed`);
process.exit(exitCode || (passed === results.length ? 0 : 1));
