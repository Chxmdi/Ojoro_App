#!/usr/bin/env node
/**
 * Step 8 e2e: the staff admin tool (apps/web) against the local Supabase stack.
 *
 *   npx supabase start                                    # local stack with the Step 8 trust migrations
 *   pnpm --filter @ojoro/web dev                          # http://localhost:5174
 *   ADMIN_URL=http://localhost:5174 node apps/web/e2e/admin.e2e.mjs
 *
 * Env (all optional): ADMIN_URL (default http://localhost:5174), SUPABASE_URL (default
 * http://127.0.0.1:54321), E2E_SHOTS (a folder for screenshots of every screen and state), HEADED=1.
 *
 * People: the seeded staff admin (+1 555 555 0190, code 123456, supabase/seed_trust.sql) and the seeded
 * non-staff Chimdi (+1 555 555 0100) for the refusal. The moderation run uses two e2e people of its own
 * (+1 555 555 9861 / 9862, made with the local admin API, never the seeded people): one posts a crew
 * message, the other reports it, so the case is new on every run and assertions never depend on global
 * counts. Seeded places are only toggled and put back.
 *
 * Both sign-ins go through the real phone-code UI. Earlier runs' decided appeals by the e2e author are
 * aged 8 days with psql on the local database, so the 5-a-week appeal limit never trips on re-runs.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);

function load(name) {
  for (const from of [
    here,
    path.join(repo, 'apps/web'),
    path.join(repo, 'apps/mobile'),
    process.cwd(),
  ]) {
    try {
      return require(
        require.resolve(name, {
          paths: [from, ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)],
        }),
      );
    } catch {
      // try the next place
    }
  }
  return require(name);
}

const { chromium } = load('playwright');
const { createClient } = load('@supabase/supabase-js');

const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:5174').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SHOTS = process.env.E2E_SHOTS ?? null;
const PASSWORD = 'ojoro-e2e-password';
const STAFF_PHONE = '+15555550190';
const T = 20_000;
const STAMP = Date.now().toString(36);

function status() {
  const out = execSync('npx -y supabase@2.122.0 status -o env', {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Object.fromEntries(
    out
      .toString()
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
}

const env = status();
const PUBLISHABLE = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
const admin = createClient(SUPABASE_URL, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function person(phone, name) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
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
  return { client, call, id: res.data.user.id, name };
}

async function onboard(p) {
  await p.call('save_onboarding', {
    p_sports: [{ sport_id: 'running', level: 'casual', is_main: true }],
    p_availability: [],
    p_discovery_radius_km: 5,
    p_pull_me_in: [],
    p_display_name: p.name,
    p_area: 'Plateau, Montréal',
    p_area_lat: 45.52,
    p_area_lng: -73.58,
  });
}

/** The staff session, by phone code (the staff numbers are test numbers in supabase/config.toml). */
async function staffSession() {
  const c = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
  const otp = await c.auth.verifyOtp({ phone: STAFF_PHONE, token: '123456', type: 'sms' });
  if (otp.error) {
    throw new Error(
      `staff code sign-in failed (${otp.error.code}); restart the stack after config.toml changes`,
    );
  }
  return otp.data.session;
}

/** Moves the e2e author's decided appeals back 8 days (local database only), under the weekly limit. */
function ageOldAppeals(userId) {
  if (!env.DB_URL) return;
  const sql = `update private.appeals set created_at = created_at - interval '8 days' where user_id = '${userId}' and status <> 'open' and created_at > now() - interval '8 days'`;
  execSync(`psql "${env.DB_URL}" -q -c "${sql}"`, { stdio: ['ignore', 'ignore', 'inherit'] });
}

const results = [];
let current = null;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
    if (SHOTS && current)
      await current
        .screenshot({ path: path.join(SHOTS, `fail-${results.length}.png`), fullPage: true })
        .catch(() => {});
  }
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function expectText(page, text, timeout = T) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function main() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  console.log(`Admin e2e against ${ADMIN} (run ${STAMP})`);

  // Fixture: an author with a crew message, and a crew-mate who reports it. -----------------------------
  const author = await person('+15555559861', 'Ade Author E2E');
  const reporter = await person('+15555559862', 'Remi Reporter E2E');
  await onboard(author);
  await onboard(reporter);
  ageOldAppeals(author.id);
  const staff = { session: await staffSession() };
  const staffClient = createClient(SUPABASE_URL, PUBLISHABLE, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${staff.session.access_token}` } },
  });
  // A failed earlier run may have left the author paused.
  await staffClient.rpc('staff_restore_account', {
    p_user_id: author.id,
    p_reason: 'e2e reset',
    p_idempotency_key: randomUUID(),
  });

  const { data: crews } = await admin
    .from('crews')
    .select('id')
    .eq('created_by', author.id)
    .eq('name', 'Admin e2e crew')
    .limit(1);
  const crewId =
    crews?.[0]?.id ??
    (
      await author.call('create_crew', {
        p_idempotency_key: randomUUID(),
        p_name: 'Admin e2e crew',
      })
    ).id;
  const code = await author.call('crew_invite_code', { p_crew_id: crewId });
  await reporter.call('join_crew', { p_code: code }).catch(() => {});
  const body = `Admin e2e message ${STAMP}`;
  const message = await author.call('send_message', {
    p_idempotency_key: randomUUID(),
    p_body: body,
    p_crew_id: crewId,
  });
  await reporter.call('report', {
    p_subject_kind: 'message',
    p_subject_id: message.id,
    p_reason: 'harassment',
    p_note: `e2e note ${STAMP}`,
  });

  const browser = await chromium.launch({ headless: !process.env.HEADED });

  // 1. Sign-in refusal for a non-staff account (through the real phone-code UI). ---------------------------
  await step('a non-staff account is refused after the code', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = (current = await ctx.newPage());
    await page.goto(ADMIN, { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: T });
    await shot(page, '01-sign-in');
    await page.getByLabel('Phone number').fill('555 555 0100');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('6-digit code').fill('123456');
    await shot(page, '02-sign-in-code');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expectText(page, "This account isn't staff.");
    await page.getByLabel('Phone number').waitFor({ timeout: T });
    const stored = await page.evaluate(() => localStorage.getItem('ojoro-staff-auth'));
    if (stored) throw new Error('the refused session was kept');
    await shot(page, '03-sign-in-refused');
    await ctx.close();
  });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = (current = await ctx.newPage());
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  // 2. Staff sign-in. -------------------------------------------------------------------------------------
  await step('staff signs in with the phone code', async () => {
    await page.goto(ADMIN, { waitUntil: 'load' });
    await page.getByLabel('Phone number').fill('555 555 0190');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('6-digit code').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Queue' }).waitFor({ timeout: T });
    await page.getByRole('navigation', { name: 'Sections' }).waitFor();
  });

  // 3. The queue: filters and the new case. -----------------------------------------------------------------
  await step('the queue filters to messages and lists the new case', async () => {
    await page.getByRole('table').first().waitFor({ timeout: T });
    await shot(page, '04-queue');
    await page.getByLabel('What').selectOption('message');
    await page.waitForURL(/kind=message/);
    await page.getByRole('row').filter({ hasText: body }).waitFor({ timeout: T });
    const row = page.getByRole('row').filter({ hasText: body });
    for (const word of ['Harassment', 'Ade Author E2E', 'Open'])
      await row.getByText(word).first().waitFor();
  });

  await step('keyboard: the skip link comes first, and a case opens from its link', async () => {
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.textContent);
    if (first !== 'Skip to content') throw new Error(`first tab stop was ${first}`);
    const link = page
      .getByRole('row')
      .filter({ hasText: body })
      .getByRole('link', { name: 'Message' });
    await link.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: /Message case/i }).waitFor({ timeout: T });
    await expectText(page, body);
    await expectText(page, `e2e note ${STAMP}`);
    await shot(page, '05-report-detail');
  });

  const caseUrl = page.url();

  // 4. Hide, with confirmation, then undo. ----------------------------------------------------------------
  await step('hide asks to confirm, needs a reason, and can be undone', async () => {
    await page.getByRole('button', { name: 'Hide content' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Hide this message?' }).waitFor();
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    if (focused !== 'Cancel') throw new Error(`safe option not focused first (${focused})`);
    await dialog.getByRole('button', { name: 'Hide', exact: true }).click();
    await dialog.getByText('Write a reason').waitFor();
    await shot(page, '06-confirm-hide-validation');
    await dialog.getByLabel(/Reason \(staff only/).fill(`e2e hide ${STAMP}`);
    await dialog.getByRole('button', { name: 'Hide', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Hidden.' }).waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Restore content' }).waitFor({ timeout: T });
    await shot(page, '07-hidden-toast-undo');
    const { data: hidden } = await admin
      .from('messages')
      .select('body')
      .eq('id', message.id)
      .single();
    if (hidden.body !== null) throw new Error('message still readable after hide');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('status').filter({ hasText: 'Undone.' }).waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Hide content' }).waitFor({ timeout: T });
    const { data: back } = await admin
      .from('messages')
      .select('body')
      .eq('id', message.id)
      .single();
    if (back.body !== body) throw new Error('undo did not restore the message');
  });

  // 5. Pause with a reason and end date, then undo. -------------------------------------------------------
  await step('pause takes a reason and an end date, and can be undone', async () => {
    await page.getByRole('button', { name: 'Pause account' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: /Pause Ade Author E2E/ }).waitFor();
    await dialog.getByRole('button', { name: '1 day' }).click();
    await dialog.getByLabel(/Reason \(staff only/).fill(`e2e pause ${STAMP}`);
    await dialog
      .getByLabel('Note to them (optional)')
      .fill('Take a day. Messages like this break the crew rules.');
    await shot(page, '08-confirm-pause');
    await dialog.getByRole('button', { name: 'Pause account' }).click();
    await page.getByRole('status').filter({ hasText: 'Paused until' }).waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Restore account' }).waitFor({ timeout: T });
    const status = await author.client.rpc('my_account_status');
    if (!status.data?.paused) throw new Error('author is not paused');
    await shot(page, '09-paused');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('status').filter({ hasText: 'Undone.' }).waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Pause account' }).waitFor({ timeout: T });
    const after = await author.client.rpc('my_account_status');
    if (after.data?.paused) throw new Error('undo did not restore the account');
  });

  // 6. Hide again, then resolve (final, no undo). --------------------------------------------------------
  await step('resolve says it cannot be undone and closes the case', async () => {
    await page.getByRole('button', { name: 'Hide content' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Reason \(staff only/)
      .fill(`e2e hide again ${STAMP}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Hide', exact: true }).click();
    await page.getByRole('button', { name: 'Restore content' }).waitFor({ timeout: T });
    await page.getByRole('button', { name: 'Resolve: actioned' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText("This can't be undone.").waitFor();
    await dialog.getByLabel(/Reason \(staff only/).fill(`e2e resolved ${STAMP}`);
    await shot(page, '10-confirm-resolve');
    await dialog.getByRole('button', { name: 'Resolve', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Case resolved.' }).waitFor({ timeout: T });
    await page.getByText('Resolved as actioned').waitFor({ timeout: T });
    if (await page.getByRole('button', { name: 'Undo' }).count())
      throw new Error('resolve offered an undo');
    if (await page.getByRole('button', { name: 'Dismiss' }).count())
      throw new Error('closed case still offers dismiss');
    await expectText(page, `e2e hide again ${STAMP}`);
    await shot(page, '11-resolved-history');
  });

  // 7. Appeals: the author appeals the hide; staff uphold it. ------------------------------------------------
  await step('an appeal on hidden content is upheld from the appeals screen', async () => {
    const st = await author.call('my_account_status');
    const hide = st.hidden_content.find((h) => !h.restored_at);
    if (!hide) throw new Error('no hidden content for the author');
    await author.call('submit_appeal', {
      p_kind: 'content_hidden',
      p_subject_id: hide.hide_id,
      p_message: `It was about the weather ${STAMP}`,
      p_idempotency_key: randomUUID(),
    });
    await page.getByRole('link', { name: 'Appeals' }).click();
    await page.getByRole('heading', { name: 'Appeals' }).waitFor({ timeout: T });
    const row = page.getByRole('row').filter({ hasText: `It was about the weather ${STAMP}` });
    await row.waitFor({ timeout: T });
    await shot(page, '12-appeals');
    await row.getByRole('link').click();
    await page.getByRole('heading', { name: /Hidden content appeal/i }).waitFor({ timeout: T });
    await expectText(page, body);
    await shot(page, '13-appeal-detail');
    await page.getByRole('button', { name: 'Uphold' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('The content is restored now.').waitFor();
    await dialog.getByLabel(/Reason \(staff only/).fill(`e2e upheld ${STAMP}`);
    await dialog.getByLabel('Note to them (optional)').fill('We looked again. It is back.');
    await dialog.getByRole('button', { name: 'Uphold' }).click();
    await page.getByRole('status').filter({ hasText: 'Appeal upheld.' }).waitFor({ timeout: T });
    await page
      .getByText(/^Upheld/)
      .first()
      .waitFor({ timeout: T });
    const { data: back } = await admin
      .from('messages')
      .select('body')
      .eq('id', message.id)
      .single();
    if (back.body !== body) throw new Error('upheld appeal did not restore the message');
  });

  // 8. The audit log shows what was done, with reasons. --------------------------------------------------------
  await step('the audit log lists every action with its reason', async () => {
    await page.getByRole('link', { name: 'Audit log' }).click();
    await page.getByRole('heading', { name: 'Audit log' }).waitFor({ timeout: T });
    for (const reason of [
      `e2e upheld ${STAMP}`,
      `e2e resolved ${STAMP}`,
      `e2e pause ${STAMP}`,
      `e2e hide ${STAMP}`,
    ]) {
      await page.getByRole('cell', { name: reason, exact: true }).first().waitFor({ timeout: T });
    }
    await page
      .getByRole('cell', { name: /Undo right after: e2e pause/ })
      .first()
      .waitFor();
    await shot(page, '14-audit-log');
    await page.getByLabel('Show').selectOption('reads');
    await page
      .getByRole('cell', { name: /Viewed case/ })
      .first()
      .waitFor({ timeout: T });
  });

  // 8b. People: search, the person screen, pause and undo, and the links into it. -------------------------------
  await step('people search refuses phone numbers and finds by name', async () => {
    await page.getByRole('link', { name: 'People' }).click();
    await page.getByRole('heading', { name: 'People' }).waitFor({ timeout: T });
    await page.getByLabel('Name or handle').fill('+1 555 555 9861');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByText("Phone numbers can't be searched.").waitFor({ timeout: T });
    await page.getByLabel('Name or handle').fill('Ade Author E2E');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL(/people\?q=/);
    await page.getByRole('link', { name: 'Ade Author E2E' }).first().waitFor({ timeout: T });
    await shot(page, '22-people-search');
  });

  await step(
    'the person screen shows their record and pauses with confirmation and undo',
    async () => {
      await page.getByRole('link', { name: 'Ade Author E2E' }).first().click();
      await page.getByRole('heading', { name: 'Ade Author E2E' }).waitFor({ timeout: T });
      for (const h of [
        /Cases against them/,
        /^Pauses/,
        /^Hidden content/,
        /^Appeals/,
        /^History/,
      ]) {
        await page.getByRole('heading', { name: h }).first().waitFor({ timeout: T });
      }
      await page
        .getByRole('cell', { name: `e2e upheld ${STAMP}` })
        .first()
        .waitFor({ timeout: T });
      await shot(page, '23-person');
      await page.getByRole('button', { name: 'Pause account' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: /Pause Ade Author E2E/ }).waitFor();
      await dialog.getByRole('radio', { name: 'Until staff restore it' }).check();
      await dialog.getByLabel(/Reason \(staff only/).fill(`e2e person pause ${STAMP}`);
      await dialog.getByRole('button', { name: 'Pause account' }).click();
      await page
        .getByRole('status')
        .filter({ hasText: 'Paused until restored.' })
        .waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Restore account' }).waitFor({ timeout: T });
      await shot(page, '24-person-paused');
      const st = await author.client.rpc('my_account_status');
      if (!st.data?.paused) throw new Error('author is not paused');
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByRole('status').filter({ hasText: 'Undone.' }).waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Pause account' }).waitFor({ timeout: T });
    },
  );

  await step('the case owner and the audit log link to the person', async () => {
    await page.goto(`${ADMIN}/#/audit`, { waitUntil: 'load' });
    await page
      .getByRole('cell', { name: `e2e person pause ${STAMP}`, exact: true })
      .first()
      .waitFor({ timeout: T });
    const row = page
      .getByRole('row')
      .filter({ hasText: `e2e person pause ${STAMP}` })
      .first();
    await row.getByRole('link', { name: 'Ade Author E2E' }).click();
    await page.getByRole('heading', { name: 'Ade Author E2E' }).waitFor({ timeout: T });
    await page.goto(caseUrl, { waitUntil: 'load' });
    await page.getByRole('complementary').getByRole('link', { name: 'Ade Author E2E' }).click();
    await page.getByRole('heading', { name: 'Ade Author E2E' }).waitFor({ timeout: T });
  });

  // 9. Place sensitivity, with undo. -----------------------------------------------------------------------------
  await step('a place is marked sensitive and put back', async () => {
    await page.getByRole('link', { name: 'Places' }).click();
    await page.getByRole('heading', { name: 'Place sensitivity' }).waitFor({ timeout: T });
    await page.getByRole('table').waitFor({ timeout: T });
    await shot(page, '15-places');
    const button = page.getByRole('button', { name: /^Mark sensitive: / }).first();
    const label = await button.getAttribute('aria-label');
    const name = label.replace('Mark sensitive: ', '');
    await button.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Reason \(staff only/).fill(`e2e place ${STAMP}`);
    await dialog.getByRole('button', { name: 'Mark sensitive' }).click();
    await page.getByRole('status').filter({ hasText: 'is sensitive now.' }).waitFor({ timeout: T });
    await page
      .getByRole('button', { name: `Mark not sensitive: ${name}` })
      .first()
      .waitFor({ timeout: T });
    await shot(page, '16-place-sensitive-toast');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('status').filter({ hasText: 'Undone.' }).waitFor({ timeout: T });
    await page
      .getByRole('button', { name: `Mark sensitive: ${name}` })
      .first()
      .waitFor({ timeout: T });
  });

  // 10. States: loading, empty, error, not found, offline. ----------------------------------------------------------
  await step('loading shows a skeleton after 300 ms, then the queue', async () => {
    await page.route('**/rest/v1/rpc/staff_queue', async (route) => {
      await sleep(1500);
      await route.continue().catch(() => {});
    });
    await page.goto(`${ADMIN}/#/queue?severity=low`, { waitUntil: 'load' });
    await page.locator('.skeleton').first().waitFor({ timeout: 1400 });
    await shot(page, '17-state-loading');
    await page.getByRole('heading', { name: 'Queue' }).waitFor();
    await page.unroute('**/rest/v1/rpc/staff_queue');
  });

  await step('empty queue says so', async () => {
    await page.route('**/rest/v1/rpc/staff_queue', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          next_cursor: null,
          counts: { open: 0, reviewing: 0, high_open: 0 },
        }),
      }),
    );
    await page.goto(`${ADMIN}/#/queue?severity=medium`, { waitUntil: 'load' });
    await expectText(page, 'Nothing in the queue.');
    await shot(page, '18-state-empty');
    await page.unroute('**/rest/v1/rpc/staff_queue');
  });

  await step('a failed load says what happened and offers a retry', async () => {
    await page.route('**/rest/v1/rpc/staff_audit_log', (route) => route.abort('failed'));
    await page.goto(`${ADMIN}/#/audit?action=all`, { waitUntil: 'load' });
    await expectText(page, "Couldn't load the audit log.");
    await page.getByRole('alert').getByRole('button', { name: 'Try again' }).waitFor();
    await shot(page, '19-state-error');
    await page.unroute('**/rest/v1/rpc/staff_audit_log');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('table').waitFor({ timeout: T });
  });

  await step('an unknown case reads as not found', async () => {
    await page.goto(`${ADMIN}/#/reports/${randomUUID()}`, { waitUntil: 'load' });
    await expectText(page, "We can't find that case.");
    await shot(page, '20-state-not-found');
  });

  await step('offline keeps the last-known case, says how old, and turns actions off', async () => {
    // Any open case will do (our own is closed by now); the queue always has the seeded ones.
    await page.goto(`${ADMIN}/#/queue`, { waitUntil: 'load' });
    await page.getByRole('table').waitFor({ timeout: T });
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    const take = page.getByRole('button', { name: 'Resolve: actioned' });
    await take.waitFor({ timeout: T });
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.getByText('Offline. Showing the last loaded data.').waitFor({ timeout: T });
    await expectText(page, 'Showing what loaded');
    if (!(await take.isDisabled())) throw new Error('actions still on while offline');
    await shot(page, '21-state-offline');
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.querySelector('.offline-bar'), null, { timeout: T });
    if (await take.isDisabled()) throw new Error('actions still off after reconnecting');
  });

  await step('sign out ends the session', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: T });
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
