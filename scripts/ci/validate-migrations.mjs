import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

// Supabase CLI migrations: supabase/migrations/YYYYMMDDHHMMSS_name.sql
const dir = new URL('../../supabase/migrations/', import.meta.url);
if (!existsSync(dir)) {
  process.stdout.write(
    'No supabase/migrations directory yet; migration validation is not applicable.\n',
  );
  process.exit(0);
}

const entries = readdirSync(dir);
const files = entries.filter((file) => extname(file) === '.sql').sort();
const strays = entries.filter((file) => extname(file) !== '.sql' && !file.startsWith('.'));
const pattern = /^\d{14}_[a-z0-9_]+\.sql$/;
const invalid = files.filter((file) => !pattern.test(file));
const prefixes = files.map((file) => file.slice(0, 14));
const duplicatePrefixes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);

// A 14-digit prefix must also be a real UTC timestamp, not just digits.
const badTimestamps = files
  .filter((file) => pattern.test(file))
  .filter((file) => {
    const p = file.slice(0, 14);
    const [y, mo, d, h, mi, s] = [
      p.slice(0, 4),
      p.slice(4, 6),
      p.slice(6, 8),
      p.slice(8, 10),
      p.slice(10, 12),
      p.slice(12, 14),
    ].map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return (
      y < 2020 ||
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== mo - 1 ||
      date.getUTCDate() !== d ||
      date.getUTCHours() !== h ||
      date.getUTCMinutes() !== mi ||
      date.getUTCSeconds() !== s
    );
  });

/**
 * Replace comments, string literals and dollar-quoted bodies with a space, in one left-to-right
 * pass, so the checks below only see statement text. Reports the first unterminated construct.
 */
function stripLiterals(sql) {
  let code = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      code += ' ';
    } else if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return { code, unterminated: 'block comment' };
      i = end + 2;
      code += ' ';
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      if (j >= sql.length) return { code, unterminated: 'string literal' };
      i = j + 1;
      code += "''";
    } else if (/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(rest)) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest)[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) return { code, unterminated: `dollar-quoted body ${tag}` };
      i = end + tag.length;
      code += ' ';
    } else {
      code += sql[i];
      i += 1;
    }
  }
  return { code, unterminated: null };
}

// Cheap SQL sanity checks. Not a parser: `supabase db reset` / `supabase db lint` are the real test.
const sqlProblems = [];
for (const file of files) {
  const sql = readFileSync(new URL(file, dir), 'utf8');
  const { code, unterminated } = stripLiterals(sql);
  if (unterminated) sqlProblems.push(`${file}: unterminated ${unterminated}`);
  if (!code.trim()) sqlProblems.push(`${file}: no SQL statements`);
  const opens = (code.match(/\(/g) ?? []).length;
  const closes = (code.match(/\)/g) ?? []).length;
  if (opens !== closes)
    sqlProblems.push(`${file}: unbalanced parentheses (${opens} open, ${closes} close)`);
  if (/\bsecurity\s+definer\b/i.test(code) && !/\bset\s+search_path\b/i.test(code)) {
    sqlProblems.push(`${file}: SECURITY DEFINER function without a pinned search_path`);
  }
}

if (
  invalid.length ||
  duplicatePrefixes.length ||
  badTimestamps.length ||
  strays.length ||
  sqlProblems.length
) {
  console.error('Migration validation failed.');
  if (invalid.length) console.error('Invalid filenames (want YYYYMMDDHHMMSS_name.sql):', invalid);
  if (duplicatePrefixes.length)
    console.error('Duplicate timestamps:', [...new Set(duplicatePrefixes)]);
  if (badTimestamps.length)
    console.error('Timestamps that are not valid UTC dates:', badTimestamps);
  if (strays.length) console.error('Non-SQL files in supabase/migrations:', strays);
  for (const problem of sqlProblems) console.error(`SQL: ${problem}`);
  process.exit(1);
}

process.stdout.write(`Validated ${files.length} migration file(s) in supabase/migrations.\n`);
