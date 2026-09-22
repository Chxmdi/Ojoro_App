import { existsSync, readdirSync } from 'node:fs';
import { extname } from 'node:path';

const dir = new URL('../../db/migrations/', import.meta.url);
if (!existsSync(dir)) {
  process.stdout.write('No db/migrations directory yet; migration validation is not applicable.\n');
  process.exit(0);
}

const files = readdirSync(dir).filter((file) => extname(file) === '.sql');
const pattern = /^\d{14}_[a-z0-9_]+\.sql$/;
const invalid = files.filter((file) => !pattern.test(file));
const prefixes = files.map((file) => file.slice(0, 14));
const duplicatePrefixes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);

if (invalid.length || duplicatePrefixes.length) {
  console.error('Migration validation failed.');
  if (invalid.length) console.error('Invalid filenames:', invalid);
  if (duplicatePrefixes.length) console.error('Duplicate timestamps:', [...new Set(duplicatePrefixes)]);
  process.exit(1);
}

process.stdout.write(`Validated ${files.length} migration file(s).\n`);
