#!/usr/bin/env node
/**
 * Polish e2e: the public "Delete your Ojoro account" page (apps/web/delete-account/index.html), the web
 * link Google Play asks for. docs/TRUST_CONTRACT.md, "Deleting your own account".
 *
 *   pnpm --filter @ojoro/web dev                          # http://localhost:5174
 *   ADMIN_URL=http://localhost:5174 node apps/web/e2e/delete-account.e2e.mjs
 *
 * Checked: the page needs no staff session and shows none of the staff tool; the staff tool at / still
 * asks staff to sign in; a staff account (+1 555 555 0191, seeded moderator) is told it can't be deleted
 * here and nothing happens; a throwaway account deletes itself through the real phone-code UI.
 *
 * The throwaway uses +1 555 555 0192, a test-code number of its own (supabase/config.toml), made here
 * with the local admin API if missing, and given a finished game with a partner (+1 555 555 9955) to check the history stays
 * under "Former member". Needs `supabase functions serve` and psql.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
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
      return require(require.resolve(name, { paths: [from] }));
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
const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SHOTS = process.env.E2E_SHOTS ?? null;
const FORMER = 'f0000000-0000-4000-8000-000000000000';
const T = 30_000;

const out = execSync('npx -y supabase@2.122.0 status -o env', {
  cwd: repo,
  stdio: ['ignore', 'pipe', 'ignore'],
});
const env = Object.fromEntries(
  out
    .toString()
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const admin = createClient(SUPABASE_URL, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const sql = (q) =>
  execSync(`psql "${DB_URL}" -At -v ON_ERROR_STOP=1`, {
    input: q,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
    .toString()
    .trim();

async function ensureUser(phone, name) {
  const existing = sql(`select id from auth.users where phone = '${phone.slice(1)}'`);
  if (existing) return existing;
  const made = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { display_name: name },
  });
  if (made.error) throw new Error(`create ${name}: ${made.error.message}`);
  return made.data.user.id;
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`ok   ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const throwaway = await ensureUser('+15555550192', 'Web Delete');
const partner = await ensureUser('+15555559955', 'Web Partner');
const activityId = sql(`
with p as (
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values ('football', now() - interval '7 days', 90, (select id from public.places order by slug limit 1), 2, 'public',
          now() - interval '7 days 1 hour', 'game_on', 'quick', '${throwaway}', '${throwaway}', 2)
  returning id
), a as (
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status, after_closes_at)
  select p.id, 'football', now() - interval '7 days', now() - interval '7 days' + interval '90 minutes',
         (select id from public.places order by slug limit 1), 2, '${throwaway}', 2, 2, 'check_in',
         now() - interval '7 days 30 minutes', now() - interval '7 days' + interval '90 minutes', 'complete', now() - interval '6 days'
  from p returning id
), att as (
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select a.id, x.u, 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location'
  from a, (values ('${throwaway}'::uuid), ('${partner}'::uuid)) x(u)
)
select id from a;`);

const browser = await chromium.launch({ headless: !process.env.HEADED });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function signInHere(phone) {
  await page.goto(`${ADMIN}/delete-account/`, { waitUntil: 'load' });
  await page.getByLabel('Phone number on your account').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
}

await step('a public page: no staff session, none of the staff tool', async () => {
  await page.goto(`${ADMIN}/delete-account/`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Delete your account' }).waitFor({ timeout: T });
  const text = await page.locator('main').innerText();
  for (const s of ['In the app', 'Account', 'What goes', 'Former member', 'Delete it here'])
    assert(text.includes(s), `missing ${s}`);
  assert(
    (await page.getByRole('navigation', { name: 'Sections' }).count()) === 0,
    'no staff navigation',
  );
  assert(!/staff/i.test(text), 'no staff wording');
  if (SHOTS)
    await page.screenshot({ path: path.join(SHOTS, 'delete-account-web.png'), fullPage: true });
});

await step('the staff tool still asks staff to sign in', async () => {
  await page.goto(`${ADMIN}/`, { waitUntil: 'load' });
  await page.getByText('For Ojoro staff only.').waitFor({ timeout: T });
});

await step('a staff account is refused, and nothing is deleted', async () => {
  await signInHere('+1 555 555 0191');
  await page.getByText("Staff accounts can't be deleted here.").first().waitFor({ timeout: T });
  assert(
    (await page.getByRole('button', { name: 'Delete my account' }).count()) === 0,
    'no delete button',
  );
  await page.getByRole('button', { name: 'Keep my account and sign out' }).click();
  assert(
    sql(`select count(*) from auth.users where phone = '15555550191'`) === '1',
    'staff account still there',
  );
});

await step('a person deletes their account with a phone code and DELETE', async () => {
  await signInHere('5555550192');
  const button = page.getByRole('button', { name: 'Delete my account' });
  await button.waitFor({ timeout: T });
  assert(await button.isDisabled(), 'disabled until DELETE');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await button.click();
  await page.getByText('Your account is deleted.').waitFor({ timeout: T });
  if (SHOTS)
    await page.screenshot({
      path: path.join(SHOTS, 'delete-account-web-done.png'),
      fullPage: true,
    });
});

await step('the account is gone; the game stays with Former member', async () => {
  assert(
    sql(`select count(*) from auth.users where id = '${throwaway}'`) === '0',
    'auth user deleted',
  );
  assert(
    sql(`select host_id from public.activities where id = '${activityId}'`) === FORMER,
    'host is Former member',
  );
  assert(
    sql(
      `select count(*) from public.attendance where activity_id = '${activityId}' and user_id = '${partner}'`,
    ) === '1',
    'partner keeps it',
  );
  const row = sql(
    `select detail::text from private.trust_audit where action = 'account_self_deleted' order by id desc limit 1`,
  );
  assert(row.includes('"source": "web"') && !row.includes(throwaway), `audit: ${row}`);
});

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
