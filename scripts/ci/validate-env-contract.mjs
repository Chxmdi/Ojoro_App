import { readFileSync } from 'node:fs';

const required = ['NODE_ENV', 'APP_ENV', 'APP_VERSION'];
const text = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const keys = new Set(
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=', 1)[0]),
);

const missing = required.filter((key) => !keys.has(key));
if (missing.length) {
  console.error('Missing required .env.example keys:', missing.join(', '));
  process.exit(1);
}

process.stdout.write('Environment contract is valid.\n');
