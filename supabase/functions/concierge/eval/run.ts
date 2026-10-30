/**
 * Concierge offline evaluation runner (docs/CONCIERGE_CONTRACT.md, "Evaluation").
 *
 *   Dry run (mock client, no network, no key):
 *     node supabase/functions/concierge/eval/run.ts --dry-run
 *   Live (calls the Claude API with ANTHROPIC_API_KEY; costs money; the owner runs it):
 *     ANTHROPIC_API_KEY=... npx -y deno@2.1.4 run --allow-env --allow-net --allow-read --allow-write \
 *       supabase/functions/concierge/eval/run.ts --live
 *
 * Options: --only <id,id>, --timeout <ms> (live default 8000, the function's), --out <dir>
 * (default supabase/functions/concierge/eval/reports). Writes <stamp>-<mode>.md and .json and
 * prints the summary. Exits 1 if any unsafe text was shown. Works in Node (type stripping) and Deno.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { CONCIERGE_TIMEOUT_MS, type MessagesClient } from '../logic.ts';
import { CASES } from './cases.ts';
import { mockClient, renderMarkdown, runEval } from './evaluate.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const live = flag('--live');
if (live === flag('--dry-run')) {
  console.error('Pass exactly one of --dry-run or --live.');
  process.exit(2);
}

const only = value('--only')?.split(',').map((s) => s.trim());
const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
const timeoutMs = Number(value('--timeout') ?? (live ? CONCIERGE_TIMEOUT_MS : 500));
const here = dirname(fileURLToPath(import.meta.url));
const outDir = value('--out') ?? join(here, 'reports');

async function liveClient(): Promise<MessagesClient> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('ANTHROPIC_API_KEY is not set. Use --dry-run, or set the key (never commit it).');
    process.exit(2);
  }
  // Deno resolves the pinned npm specifier; Node needs @anthropic-ai/sdk installed. A variable
  // specifier keeps test bundlers from trying to resolve it in dry runs.
  const specs = ['npm:@anthropic-ai/sdk@1.3.0', '@anthropic-ai/sdk'];
  for (const spec of specs) {
    try {
      const mod = (await import(/* @vite-ignore */ spec)) as {
        default: new (o: { apiKey: string; maxRetries: number; timeout: number }) => MessagesClient;
      };
      return new mod.default({ apiKey: key, maxRetries: 0, timeout: timeoutMs });
    } catch {
      // Try the next specifier.
    }
  }
  console.error('Could not load @anthropic-ai/sdk. Run the live mode with Deno (see the header).');
  process.exit(2);
}

const client = live ? await liveClient() : mockClient(CASES);
console.log(`${live ? 'LIVE' : 'DRY RUN'}: ${cases.length} cases, timeout ${timeoutMs} ms`);
const { summary, results } = await runEval(client, {
  mode: live ? 'live' : 'dry-run',
  cases,
  timeoutMs,
  onCase: (r) =>
    console.log(
      `${r.useful ? 'ok  ' : 'MISS'} ${r.safe ? '    ' : 'UNSAFE '}${r.id} → ${r.outcome} ${r.picked ?? r.start ?? ''} (${r.source}${r.fallback_reason ? `/${r.fallback_reason}` : ''}${r.model_ms !== null ? `, ${r.model_ms} ms` : ''})`,
    ),
});

const when = new Date();
const stamp = when.toISOString().replace(/[:.]/g, '-');
await mkdir(outDir, { recursive: true });
const base = join(outDir, `${stamp}-${summary.mode}`);
await writeFile(`${base}.json`, JSON.stringify({ summary, results }, null, 2));
await writeFile(`${base}.md`, renderMarkdown(summary, results, when));
console.log(JSON.stringify(summary, null, 2));
console.log(`Report: ${base}.md`);
process.exit(summary.safety.unsafe_shown > 0 ? 1 : 0);
