// Step 7 e2e: Passport detail, the goal (You and Passport), achievements and personal bests, the
// privacy of someone else's Passport, the goal's visibility setting, and the links from Recap and
// Result stamps into the Passport, against the local Supabase stack and the Expo web app.
//
//   node apps/mobile/e2e/passport.e2e.mjs
//
// Needs: `npx supabase start` (local stack with the Step 7 migrations and seed_passport.sql), the Expo
// web dev server (APP_URL or E2E_APP_URL, default http://localhost:8100) and Playwright. Re-runnable:
// it uses its own two test users (phones +1 555 555 974x, made with the local admin API) for everything
// it changes, and only reads the seeded Chimdi's Passport (stamps with a Recap / Result). Assertions
// never depend on global counts or the time of day.
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
  a: { phone: '+15555559741', name: 'Tobi E' },
  b: { phone: '+15555559742', name: 'Ama F' },
};
const CHIMDI_PHONE = '+15555550100';

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



async function chimdi() {
  const client = createClient(URL_, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.verifyOtp({ phone: CHIMDI_PHONE, token: '123456', type: 'sms' });
  if (error) throw new Error(`chimdi sign in: ${error.message}`);
  const call = async (fn, args = {}) => {
    const res = await client.rpc(fn, args);
    if (res.error) throw new Error(`chimdi ${fn}: ${res.error.message}`);
    return res.data;
  };
  return { call, session: data.session, id: data.user.id, first: 'Chimdi' };
}

async function main() {
  const A = await signIn(PEOPLE.a);
  const B = await signIn(PEOPLE.b);
  // A clean start: no blocks between them, no goal, the default goal and history settings.
  await admin.from('blocks').delete().or(`and(blocker_id.eq.${A.id},blocked_id.eq.${B.id}),and(blocker_id.eq.${B.id},blocked_id.eq.${A.id})`);
  await A.call('clear_goal');
  await A.call('set_goals_visibility', { p_visibility: 'friends' });
  await admin.from('privacy_settings').update({ history_visibility: 'friends' }).eq('user_id', A.id);

  const browser = await chromium.launch();
  const pa = await browserAs(browser, A);
  const pb = await browserAs(browser, B);
  const sheet = () => pa.page.getByTestId('goal-sheet');

  try {
    await step('You: an empty goal offers SET A GOAL; the Passport block opens the Passport', async () => {
      await open(pa.page, '/you', 'passport-block');
      await pa.page.getByTestId('goal-block').getByText('SET A GOAL').waitFor({ timeout: 30_000 });
      await pa.page.getByTestId('open-passport').waitFor();
      await pa.page.getByTestId('passport-block').click();
      await pa.page.waitForURL(/\/passport$/, { timeout: 30_000 });
      await pa.page.getByTestId('passport-headline').waitFor({ timeout: 30_000 });
      const head = await pa.page.getByTestId('passport-headline').innerText();
      assert(/STAMPS?\./.test(head) && /PLACES?\./.test(head), `headline ${head}`);
      await pa.page.getByTestId('passport-stamps-empty').waitFor();
      await pa.page.getByText('Friends see your Passport and your goal.').waitFor();
    });

    await step('SET A GOAL: validation in words, then 3 NEW PLACES on Passport and You', async () => {
      await open(pa.page, '/passport', 'goal-block');
      await pa.page.getByTestId('goal-block').getByText('SET A GOAL').click();
      await sheet().waitFor();
      await pa.page.getByTestId('goal-kind-places').click();
      await pa.page.getByTestId('goal-save').click();
      await sheet().getByText(/Error: Pick a whole number from 1 to 100/).waitFor();
      await pa.page.getByTestId('goal-target').fill('3');
      await pa.page.getByTestId('goal-save').click();
      await pa.page.getByTestId('goal-block').getByText('3 NEW PLACES.').waitFor({ timeout: 30_000 });
      await pa.page.getByTestId('goal-block').getByText('0 of 3 so far.').waitFor();
      const goal = await A.call('passport_goal', { p_user_id: A.id });
      assert(goal?.kind === 'places' && Number(goal.target_value) === 3, `goal ${JSON.stringify(goal)}`);
      await open(pa.page, '/you', 'goal-block');
      await pa.page.getByTestId('goal-block').getByText('3 NEW PLACES.').waitFor({ timeout: 30_000 });
    });

    await step('CHANGE: a personal best with a time, then CLEAR GOAL', async () => {
      await pa.page.getByTestId('goal-block').getByText('CHANGE').click();
      await sheet().waitFor();
      await pa.page.getByTestId('goal-kind-personal_best').click();
      await pa.page.getByTestId('goal-discipline').fill('5k');
      await pa.page.getByTestId('goal-target').fill('soon');
      await pa.page.getByTestId('goal-save').click();
      await sheet().getByText(/Error: Write the time as minutes and seconds/).waitFor();
      await pa.page.getByTestId('goal-target').fill('25:00');
      await pa.page.getByTestId('goal-save').click();
      await pa.page.getByTestId('goal-block').getByText('SUB-25 5K.').waitFor({ timeout: 30_000 });
      await pa.page.getByTestId('goal-block').getByText(/No result yet/).waitFor();
      await pa.page.getByTestId('goal-block').getByText('CHANGE').click();
      await sheet().waitFor();
      await pa.page.getByTestId('goal-clear').click();
      await pa.page.getByTestId('goal-block').getByText('SET A GOAL').waitFor({ timeout: 30_000 });
      assert((await A.call('passport_goal', { p_user_id: A.id })) == null, 'goal still active');
    });

    await step("someone else's Passport follows their history and goals settings", async () => {
      await A.call('set_goal', { p_kind: 'sessions', p_target_value: 10, p_idempotency_key: key() });
      await open(pb.page, `/profile/${A.id}/passport`, 'passport-screen');
      await pb.page.getByText(/keeps their games and Passport to a smaller circle/).waitFor({ timeout: 30_000 });
      assert((await pb.page.getByTestId('passport-headline').count()) === 0, 'totals shown past the history setting');
      assert((await pb.page.getByTestId('goal-block').count()) === 0, 'goal shown past the goals setting');
      await pb.page.getByTestId('passport-report-block-link').waitFor();
      // Opened up: totals and the goal, without SET or CHANGE.
      await admin.from('privacy_settings').update({ history_visibility: 'everyone' }).eq('user_id', A.id);
      await A.call('set_goals_visibility', { p_visibility: 'everyone' });
      await open(pb.page, `/profile/${A.id}/passport`, 'passport-headline');
      await pb.page.getByTestId('goal-block').getByText('10 SESSIONS.').waitFor({ timeout: 30_000 });
      assert((await pb.page.getByTestId('goal-block').getByText('CHANGE').count()) === 0, 'CHANGE on someone else');
      await pb.page.getByTestId('passport-report-block').waitFor();
    });

    await step('Settings: who sees your goal saves at once', async () => {
      await open(pa.page, '/settings/privacy', 'privacy-goals');
      await pa.page.getByTestId('privacy-goals-only_me').click();
      await until('goals visibility saved', async () => {
        const v = await A.call('passport_view', { p_user_id: A.id });
        return v?.goals_visibility === 'only_me';
      });
      await open(pb.page, `/profile/${A.id}/passport`, 'passport-headline');
      await pb.page.waitForTimeout(2_000);
      assert((await pb.page.getByTestId('goal-block').count()) === 0, 'goal still shown after Just me');
    });

    const C = await chimdi();
    const stamps = await C.call('passport_stamps', { p_user_id: C.id, p_limit: 100 });
    const challengeStamp = stamps.find((s) => s.challenge_event_id);
    const gameStamp = stamps.find((s) => s.activity_id);
    const pc = await browserAs(browser, C);

    await step('Passport detail: personal bests, milestones, achievements, filters', async () => {
      await open(pc.page, '/passport', 'passport-headline');
      const view = await C.call('passport_view', { p_user_id: C.id });
      if (view.personal_bests.length) await pc.page.getByTestId('passport-pbs').waitFor();
      if (view.milestones.length) await pc.page.getByTestId('passport-milestones').waitFor();
      await pc.page.getByTestId('passport-achievements').getByText('REACHED').first().waitFor({ timeout: 30_000 });
      await pc.page.getByTestId('passport-by-sport').click();
      await pc.page.getByTestId('passport-filter-value').waitFor();
      await pc.page.locator('[data-testid^="stamp-"]').first().waitFor({ timeout: 30_000 });
    });

    if (challengeStamp) {
      await step("Result: the PASSPORT row opens the Passport at that Challenge's stamp", async () => {
        await open(pc.page, `/event/${challengeStamp.challenge_event_id}`, 'result-you');
        await pc.page.getByTestId('result-you').getByText(/Added to your Passport/).waitFor({ timeout: 30_000 });
        await pc.page.getByTestId('result-you').click();
        await pc.page.waitForURL(/\/passport\?event=/, { timeout: 30_000 });
        await pc.page.getByTestId('passport-target').getByText('OPEN THE RESULT').waitFor({ timeout: 30_000 });
      });
    } else console.log('skip Result link: no Challenge stamp in the seed');

    if (gameStamp) {
      await step("Recap: the stamp opens the Passport at that game's stamp", async () => {
        await open(pc.page, `/activity/${gameStamp.activity_id}/recap`, 'passport-stamp');
        await pc.page.getByTestId('passport-stamp').click();
        await pc.page.waitForURL(/\/passport\?activity=/, { timeout: 30_000 });
        await pc.page.getByTestId('passport-headline').waitFor({ timeout: 30_000 });
        // The stamp sits on top when it's among the latest page.
        const latest = stamps.slice(0, 12).some((s) => s.activity_id === gameStamp.activity_id);
        if (latest) await pc.page.getByTestId('passport-target').getByText('OPEN THE RECAP').waitFor({ timeout: 30_000 });
      });
    } else console.log('skip Recap link: no game stamp in the seed');
  } finally {
    await A.call('clear_goal').catch(() => {});
    await A.call('set_goals_visibility', { p_visibility: 'friends' }).catch(() => {});
    await admin.from('privacy_settings').update({ history_visibility: 'friends' }).eq('user_id', A.id);
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
