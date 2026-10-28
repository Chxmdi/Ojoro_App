#!/usr/bin/env node
/**
 * Slice 01 e2e: auth gate, phone sign-in, onboarding, You, profile report and block.
 *
 * Runs against the local app (Expo web) and the local Supabase stack:
 *
 *   npx supabase start                         # local stack (Docker); seeded by `db reset`
 *   pnpm --filter @ojoro/mobile web            # Expo web, default http://localhost:8081
 *   APP_URL=http://localhost:8100 node apps/mobile/e2e/auth-onboarding.e2e.mjs
 *
 * Env (all optional):
 *   APP_URL             the Expo web origin (default http://localhost:8100)
 *   SUPABASE_URL        default http://127.0.0.1:54321
 *   SUPABASE_SECRET_KEY the local secret (service) key; read from `supabase status` when unset
 *   HEADED=1            show the browser
 *
 * Needs Playwright with Chromium (`npx playwright install chromium`), found through NODE_PATH or
 * the app's node_modules. Test phones (code 123456) come from supabase/config.toml:
 *   +1 555 555 0199  a brand-new user. This script deletes it first, so every run starts fresh.
 *   +1 555 555 0100  Chimdi, seeded and onboarded.
 * It changes no seeded person's data: the new user reports and blocks Dayo F (seeded), then
 * unblocks, and the new user is deleted on the next run.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

function load(name) {
  for (const from of [here, path.join(repo, 'apps/mobile'), process.cwd()]) {
    try {
      return require(require.resolve(name, { paths: [from, ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)] }));
    } catch {
      // try the next place
    }
  }
  return require(name);
}

const { chromium } = load('playwright');
const { createClient } = load('@supabase/supabase-js');

const APP = (process.env.APP_URL ?? 'http://localhost:8100').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const NEW_PHONE = '15555550199';
const CHIMDI_PHONE = '5555550100';
const DAYO = 'a0000000-0000-4000-8000-000000000013';
const ADE = 'a0000000-0000-4000-8000-000000000002';
const T = 20_000;

function secretKey() {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const out = execSync('npx -y supabase@2.122.0 status -o json', { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] });
  const status = JSON.parse(out.toString());
  return status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
}

const results = [];
let current = null; // the page under test, for a failure screenshot
const SHOTS = process.env.E2E_SHOTS ?? null;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL ${name}\n       ${String(error?.message ?? error).split('\n')[0]}`);
    if (current) {
      console.log(`       at ${current.url()}`);
      if (SHOTS) await current.screenshot({ path: path.join(SHOTS, 'e2e-failure.png'), fullPage: true }).catch(() => {});
    }
    throw error;
  }
}

const pathOf = (page) => new URL(page.url()).pathname;
async function waitPath(page, want) {
  await page.waitForFunction((p) => window.location.pathname === p, want, { timeout: T });
}
const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`).first();

async function signInByPhone(page, typed) {
  await byTestId(page, 'welcome-phone').click();
  await waitPath(page, '/phone');
  await byTestId(page, 'phone-input').fill(typed);
  await byTestId(page, 'phone-send').click();
  await waitPath(page, '/code');
  // A wrong code first: the error is in words, and nobody gets in.
  await byTestId(page, 'code-input').fill('000000');
  await page.getByText("That code didn't work", { exact: false }).first().waitFor({ timeout: T });
  await byTestId(page, 'code-input').fill('123456');
}

async function main() {
  const admin = createClient(SUPABASE_URL, secretKey(), { auth: { persistSession: false } });

  // Start from a brand-new account: delete the e2e user if a previous run left it.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  for (const user of list.users.filter((u) => u.phone === NEW_PHONE)) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => pageErrors.push(e.message));
    if (process.env.E2E_CONSOLE) page.on('console', (m) => console.log(`       [${m.type()}] ${m.text().slice(0, 200)}`));
  };

  try {
    console.log(`e2e against ${APP}`);
    const ctx = await context();
    const page = await ctx.newPage();
    watch(page);
    current = page;

    await step('signed out: the gate shows Welcome', async () => {
      await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitPath(page, '/welcome');
      await page.getByText("WE'RE DOING IT AT 7.").waitFor({ timeout: T });
    });

    await step('phone sign-in validates, sends a code, and rejects a wrong one', async () => {
      await byTestId(page, 'welcome-phone').click();
      await waitPath(page, '/phone');
      await byTestId(page, 'phone-input').fill('555');
      await byTestId(page, 'phone-send').click();
      await page.getByText('Add your country code', { exact: false }).first().waitFor({ timeout: T });
      await page.goBack();
      await waitPath(page, '/welcome');
      await signInByPhone(page, '+1 555 555 0199');
    });

    await step('a new account starts onboarding with its name', async () => {
      await waitPath(page, '/name');
      await byTestId(page, 'name-continue').click();
      await page.getByText('Add the name people will know you by.').waitFor({ timeout: T });
      await byTestId(page, 'name-input').fill('Eden E');
      await byTestId(page, 'name-continue').click();
      await waitPath(page, '/sports');
    });

    await step('sports: chips, a level each (validated), back and forth keeps state', async () => {
      await byTestId(page, 'sport-football').click();
      await byTestId(page, 'sport-boxing').click();
      await byTestId(page, 'sports-continue').click();
      await page.getByText('Pick a rough level for Football and Boxing.').waitFor({ timeout: T });
      await byTestId(page, 'level-football-intermediate').click();
      await byTestId(page, 'level-boxing-learning').click();
      await page.getByText('Levels are only used to match you fairly.', { exact: false }).waitFor();
      await byTestId(page, 'sports-continue').click();
      await waitPath(page, '/when');
      await page.goBack();
      await waitPath(page, '/sports');
      const pressed = await byTestId(page, 'level-boxing-learning').getAttribute('aria-pressed');
      if (pressed !== 'true') throw new Error('the boxing level was lost going back');
      await byTestId(page, 'sports-continue').click();
      await waitPath(page, '/when');
    });

    await step('when: free times, distance, Pull Me In', async () => {
      await page.getByRole('button', { name: /Tuesday evening/ }).click();
      await page.getByRole('button', { name: /Saturday morning/ }).click();
      await byTestId(page, 'radius-5').click();
      await byTestId(page, 'pull-me-in-football').click();
      await byTestId(page, 'when-continue').click();
      await waitPath(page, '/privacy');
    });

    await step("privacy: product defaults, then LET'S MOVE lands on Home", async () => {
      for (const id of ['privacy-sports-everyone', 'privacy-history-friends', 'privacy-availability-crews']) {
        const on = await byTestId(page, id).getAttribute('aria-pressed');
        if (on !== 'true') throw new Error(`${id} is not the default`);
      }
      await byTestId(page, 'privacy-history-only_me').click();
      await byTestId(page, 'onboarding-lets-move').click();
      await waitPath(page, '/');
    });

    await step('saved in one call: profile, sports, availability, privacy', async () => {
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const id = users.users.find((u) => u.phone === NEW_PHONE)?.id;
      const [{ data: profile }, { data: sports }, { data: slots }, { data: privacy }, { data: pmi }] =
        await Promise.all([
          admin.from('profiles').select('display_name, onboarding_completed_at').eq('id', id).single(),
          admin.from('user_sports').select('sport_id, level, is_main').eq('user_id', id),
          admin.from('availability_slots').select('day_of_week, part').eq('user_id', id),
          admin.from('privacy_settings').select('*').eq('user_id', id).single(),
          admin.from('pull_me_in').select('sport_id, scope').eq('user_id', id),
        ]);
      const check = (cond, what) => {
        if (!cond) throw new Error(what);
      };
      check(profile.display_name === 'Eden E' && profile.onboarding_completed_at, 'profile');
      check(sports.length === 2 && sports.find((s) => s.sport_id === 'football')?.is_main, 'sports');
      check(sports.find((s) => s.sport_id === 'boxing')?.level === 'learning', 'levels');
      check(slots.length === 2, 'availability');
      check(privacy.history_visibility === 'only_me' && privacy.sports_visibility === 'everyone', 'privacy');
      check(pmi.length === 1 && pmi[0].sport_id === 'football', 'pull me in');
      const { data: radius } = await admin.from('profile_private').select('discovery_radius_km').eq('user_id', id).single();
      check(radius.discovery_radius_km === 5, 'radius');
    });

    await step('You shows the new profile, levels to the owner, and the visibility line', async () => {
      await page.getByRole('tab', { name: /You/ }).click();
      await waitPath(page, '/you');
      await byTestId(page, 'profile-name').waitFor({ timeout: T });
      if ((await byTestId(page, 'profile-name').innerText()).trim() !== 'EDEN E') throw new Error('name');
      await page.getByText('intermediate', { exact: false }).first().waitFor();
      const line = await byTestId(page, 'visibility-line').innerText();
      if (!line.includes('Only you see your Passport')) throw new Error(`visibility line: ${line}`);
      await page.getByText('Usually free Tue evenings, Sat mornings.', { exact: false }).waitFor();
      await byTestId(page, 'passport-block').waitFor();
    });

    await step('Edit visibility opens privacy settings and saves', async () => {
      await byTestId(page, 'edit-visibility').click();
      await waitPath(page, '/settings/privacy');
      await byTestId(page, 'privacy-history-friends').click();
      await page.getByText('Saved.').first().waitFor({ timeout: T });
      await page.goBack();
      await waitPath(page, '/you');
      await page.getByText('Friends also see your Passport', { exact: false }).first().waitFor({ timeout: T });
    });

    await step("another profile: no levels, report with a reason", async () => {
      await page.goto(`${APP}/profile/${DAYO}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await byTestId(page, 'profile-name').waitFor({ timeout: T });
      await page.getByText('WHAT THEY DO').waitFor({ timeout: T });
      await page.waitForTimeout(500);
      const text = await page.locator('body').innerText();
      if (/\b(learning|casual|intermediate|advanced)\b/i.test(text.split('WHAT THEY DO')[1] ?? '')) {
        throw new Error("someone else's level is shown");
      }
      await byTestId(page, 'profile-report-block').click();
      await byTestId(page, 'report-block-send').click();
      await page.getByText('Pick what happened.').waitFor({ timeout: T });
      await byTestId(page, 'report-reason-spam').click();
      await byTestId(page, 'report-block-send').click();
      await byTestId(page, 'report-block-sent').waitFor({ timeout: T });
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const id = users.users.find((u) => u.phone === NEW_PHONE)?.id;
      const { data: reports } = await admin
        .from('reports')
        .select('subject_kind, subject_id, reason')
        .eq('reporter_id', id);
      if (!reports?.some((r) => r.subject_id === DAYO && r.reason === 'spam')) throw new Error('report not stored');
    });

    await step('block asks first, then hides the profile; unblock restores it', async () => {
      await byTestId(page, 'report-block-block').click();
      await page.getByText('BLOCK DAYO?').waitFor({ timeout: T });
      await page.getByRole('button', { name: 'BLOCK', exact: true }).click();
      await byTestId(page, 'profile-blocked').waitFor({ timeout: T });
      await byTestId(page, 'profile-unblock').click();
      await byTestId(page, 'profile-name').waitFor({ timeout: T });
    });

    await step('signing out returns to Welcome', async () => {
      await page.getByRole('tab', { name: /You/ }).click().catch(() => page.goto(`${APP}/you`));
      await page.goto(`${APP}/you`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByRole('button', { name: 'Settings and privacy' }).click();
      await byTestId(page, 'sign-out').click();
      await waitPath(page, '/welcome');
    });
    await ctx.close();

    const ctx2 = await context();
    const chimdi = await ctx2.newPage();
    watch(chimdi);
    current = chimdi;
    await step('returning Chimdi: a deep link survives sign-in', async () => {
      await chimdi.goto(`${APP}/profile/${ADE}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitPath(chimdi, '/welcome');
      await signInByPhone(chimdi, CHIMDI_PHONE);
      await waitPath(chimdi, `/profile/${ADE}`);
      await byTestId(chimdi, 'profile-name').waitFor({ timeout: T });
      await chimdi.getByText('games with you', { exact: false }).first().waitFor({ timeout: T });
    });

    await step('returning Chimdi lands on Home directly, then sees You', async () => {
      await chimdi.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await chimdi.waitForTimeout(1500);
      if (pathOf(chimdi) !== '/') throw new Error(`landed on ${pathOf(chimdi)}`);
      await chimdi.getByRole('tab', { name: /You/ }).click();
      await waitPath(chimdi, '/you');
      const name = (await byTestId(chimdi, 'profile-name').innerText()).trim();
      if (name !== 'CHIMDI O') throw new Error(`name ${name}`);
      await chimdi.getByText('SHOWS UP', { exact: false }).first().waitFor({ timeout: T });
    });
    await ctx2.close();

    if (pageErrors.length > 0) {
      console.log(`  note: ${pageErrors.length} page error(s) seen:\n    ${pageErrors.slice(0, 5).join('\n    ')}`);
    }
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed`);
  })
  .catch((error) => {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed; failed: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
