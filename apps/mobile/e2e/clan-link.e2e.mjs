// Polish e2e: the clan INVITE link `ojoro://clan/join/<code>` (features/clans/logic.ts clanInviteText) opens
// JOIN A CLAN with the code filled in, joins on the tap (join_clan_with_code) and opens the clan.
//
//   node apps/mobile/e2e/clan-link.e2e.mjs
//
// Its own two people (+1 555 555 9953 captain, +1 555 555 9954 joiner, made with the local admin API).
// Re-runnable: the captain's clan is reused and the joiner leaves it at the start and the end. Needs the
// local stack, the Expo web dev server (APP_URL, default http://localhost:8100), psql and Playwright.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(here, '..', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const APP = process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100';
const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
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

function sql(query) {
  return execSync(`psql "${DB_URL}" -At -v ON_ERROR_STOP=1`, { input: query, stdio: ['pipe', 'pipe', 'inherit'] })
    .toString()
    .trim();
}

async function signIn({ phone, name }, { fresh = false } = {}) {
  if (fresh) sql(`delete from auth.users where phone = '${phone.replace('+', '')}';`);
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

async function until(what, fn, timeout = 20_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${what}`);
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
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}


const captain = await signIn({ phone: '+15555559953', name: 'Kemi C' });
const joiner = await signIn({ phone: '+15555559954', name: 'Tobi J' });

// The captain's invite-only clan (made once, reused: clan creation is limited to 3 a day).
let clanId = (await captain.call('my_clans')).find((c) => c.role === 'captain')?.clan_id;
if (!clanId) {
  const made = await captain.call('create_clan', { p_idempotency_key: randomUUID(), p_name: 'Link Test Clan', p_join_policy: 'invite' });
  clanId = made.id ?? made.clan_id;
}
const code = await captain.call('clan_invite_code', { p_clan_id: clanId });
// Start each run outside the clan.
if ((await joiner.call('my_clans')).some((c) => c.clan_id === clanId)) await joiner.call('leave_clan', { p_clan_id: clanId });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: {
    cookies: [],
    origins: [{ origin: new URL(APP).origin, localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(joiner.session) }] }],
  },
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
const shots = process.env.E2E_SHOTS;

await step('a wrong code says so, in words', async () => {
  await open(page, '/clan/join/ZZZZ2222', 'clan-join');
  await page.getByTestId('clan-join-submit').click();
  await page.getByText("That invite code doesn't work.").first().waitFor({ timeout: 20_000 });
  assert(!(await joiner.call('my_clans')).some((c) => c.clan_id === clanId), 'not joined');
});

await step('ojoro://clan/join/<code> opens JOIN with the code, and joins only on the tap', async () => {
  await open(page, `/clan/join/${code}`, 'clan-join');
  assert((await page.getByTestId('clan-code-input').inputValue()) === code, 'code filled in from the link');
  assert(!(await page.getByText('This screen doesn').count()), 'not the not-found screen');
  assert(!(await joiner.call('my_clans')).some((c) => c.clan_id === clanId), 'opening the link alone does not join');
  if (shots) await page.screenshot({ path: join(shots, 'clan-join.png') });
  await page.getByTestId('clan-join-submit').click();
  await page.waitForURL(new RegExp(`/clan/${clanId}$`), { timeout: 60_000 });
  await until('membership', async () => (await joiner.call('my_clans')).some((c) => c.clan_id === clanId));
});

await step('opening the link again when already in just opens the clan', async () => {
  await open(page, `/clan/join/${code.toLowerCase()}`, 'clan-join');
  await page.getByTestId('clan-join-submit').click();
  await page.waitForURL(new RegExp(`/clan/${clanId}$`), { timeout: 60_000 });
});

await joiner.call('leave_clan', { p_clan_id: clanId });
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
