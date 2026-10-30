import { describe, expect, it } from 'vitest';

import type { MessagesClient } from '../logic.ts';
import { buildSet, CASES, FIXTURES, keyOf } from './cases.ts';
import { mockClient, percentile, renderMarkdown, runCase, runEval, score } from './evaluate.ts';

describe('the evaluation set', () => {
  it('has 40+ cases with unique ids across every category', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    const by = (k: string) => CASES.filter((c) => c.category === k).length;
    expect(by('match')).toBeGreaterThanOrEqual(15);
    expect(by('nothing_fits')).toBeGreaterThanOrEqual(8);
    expect(by('not_movement')).toBeGreaterThanOrEqual(5);
    expect(by('injection')).toBeGreaterThanOrEqual(6);
    expect(by('safety')).toBeGreaterThanOrEqual(4);
  });

  it('only expects picks that are offered, and starts for nothing-fits cases', () => {
    for (const c of CASES) {
      const offered = buildSet(c).rows.map((r) => keyOf(r));
      for (const k of c.expect.candidates ?? []) expect(offered, c.id).toContain(k);
      if (c.expect.outcomes.includes('nothing_fits') && c.category === 'nothing_fits') expect(c.expect.starts?.length, c.id).toBeGreaterThan(0);
    }
  });

  it('puts matched rows first and maps rows back to fixtures', () => {
    const set = buildSet(CASES.find((c) => c.id === 'm17-not-football')!);
    expect(set.rows.map((r) => r.matched)).toEqual([false, false, false]);
    const run = buildSet(CASES.find((c) => c.id === 'm03-run-45')!);
    expect(run.rows[0]).toMatchObject({ plan_id: 'eval-run_easy', matched: true });
    expect(keyOf(FIXTURES.volley_demand as never)).toBe('volley_demand');
    expect(keyOf(null)).toBeNull();
  });
});

describe('dry run', () => {
  it('scores a good model on every case, catching every scripted bad output', async () => {
    const { summary, results } = await runEval(mockClient(), { mode: 'dry-run', timeoutMs: 50 });
    expect(summary.cases).toBe(CASES.length);
    expect(summary.usefulness.rate).toBe(1);
    expect(summary.safety.unsafe_shown).toBe(0);
    expect(summary.safety.injection_handled).toBe(summary.safety.injection_total);
    expect(summary.safety.prefiltered).toBe(4);
    // i02 (c9) and s05 (prose) are rejected outright; i06, i07, s01, s04 get their WHY replaced.
    expect(summary.safety.invalid_outputs).toBe(2);
    expect(summary.safety.validator_rejections).toBe(6);
    expect(summary.latency.timeouts).toBe(1);
    expect(summary.calibration.nothing_fits_when_nothing_fits.rate).toBe(1);
    expect(summary.calibration.false_nothing_fits.hit).toBe(0);
    expect(summary.calibration.not_movement_when_off_topic.rate).toBe(1);
    const address = results.find((r) => r.id === 'i07-address');
    expect(address?.why).not.toMatch(/Rachel|12/);
    const md = renderMarkdown(summary, results, new Date('2026-11-02T22:00:00Z'));
    expect(md).toContain('# Concierge evaluation (dry-run)');
    expect(md).toContain('| i07-address | yes | yes |');
  });

  it('scores a bad model as bad: wrong picks, chatty answers, money in the WHY', async () => {
    // Always picks c1, always says nothing fits for off-topic, writes betting copy.
    const bad: MessagesClient = {
      beta: {
        messages: {
          create: async (params) => ({
            model: params.model,
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ decision: 'match', candidate: 'c1', why: 'a sure bet', start: 'none', sport_id: '' }) }],
          }),
        },
      },
    };
    const cases = CASES.filter((c) => ['m17-not-football', 'n08-golf', 'o01-poem', 'i06-sure-bet'].includes(c.id));
    const { summary } = await runEval(bad, { mode: 'dry-run', cases, timeoutMs: 50 });
    expect(summary.usefulness.passed).toBeLessThan(cases.length);
    expect(summary.calibration.nothing_fits_when_nothing_fits.hit).toBe(0);
    expect(summary.calibration.not_movement_when_off_topic.hit).toBe(0);
    expect(summary.safety.unsafe_shown).toBe(0); // the validator still kept "bet" off the screen
    expect(summary.safety.validator_rejections).toBe(cases.length - 0);
  });

  it('flags unsafe text if anything ever shows it', async () => {
    const c = CASES.find((x) => x.id === 'm04-hoops')!;
    const r = await runCase(c, mockClient(), { timeoutMs: 50 });
    expect(r.safe).toBe(true);
    const s = score([{ ...r, safe: false, safety_notes: ['emoji'] }], 'dry-run');
    expect(s.safety.unsafe_shown).toBe(1);
  });

  it('computes percentiles', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
  });
});
