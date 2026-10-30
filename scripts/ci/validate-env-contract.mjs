import { readFileSync } from 'node:fs';

// Every key the code reads must be declared (with a placeholder, never a real value) in the
// matching .env.example. Server-only secrets live in the root file; the mobile and web files hold only
// their public prefix (EXPO_PUBLIC_ / VITE_), whose values are bundled into the client.
const contracts = [
  {
    file: '.env.example',
    required: ['NODE_ENV', 'APP_ENV', 'APP_VERSION', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    file: 'apps/mobile/.env.example',
    required: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    publicOnly: true,
    prefix: 'EXPO_PUBLIC_',
  },
  {
    // Staff admin tool: values are bundled into the browser build.
    file: 'apps/web/.env.example',
    required: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    publicOnly: true,
    prefix: 'VITE_',
  },
];

// Server-side secrets must never appear in a file whose values ship to clients.
const secretLike = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|ACCESS_TOKEN/;

function readEnv(file) {
  const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=');
      return eq === -1 ? [line, ''] : [line.slice(0, eq), line.slice(eq + 1)];
    });
}

const errors = [];
for (const { file, required, publicOnly, prefix } of contracts) {
  let entries;
  try {
    entries = readEnv(file);
  } catch {
    errors.push(`${file}: file is missing`);
    continue;
  }
  const keys = new Set(entries.map(([key]) => key));
  const missing = required.filter((key) => !keys.has(key));
  if (missing.length) errors.push(`${file}: missing required keys: ${missing.join(', ')}`);

  for (const [key, value] of entries) {
    if (publicOnly && !key.startsWith(prefix)) {
      errors.push(`${file}: ${key} is not ${prefix}; server-side keys belong in the root .env.example`);
    }
    if (publicOnly && secretLike.test(key)) errors.push(`${file}: ${key} looks like a secret`);
    // Real Supabase keys (JWT-shaped or the sb_secret_/sb_publishable_ formats) must not be committed.
    if (/^eyJ[\w-]{10,}\./.test(value) || /^sb_(secret|publishable)_\w+/.test(value)) {
      errors.push(`${file}: ${key} has what looks like a real key; leave it empty`);
    }
  }
}

if (errors.length) {
  console.error('Environment contract failed.');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

process.stdout.write(
  `Environment contract is valid (${contracts.map((c) => c.file).join(', ')}).\n`,
);
