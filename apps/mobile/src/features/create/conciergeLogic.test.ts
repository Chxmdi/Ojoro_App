import { describe, expect, it } from 'vitest';

import type { ConciergeAnswer, ConciergeIdea } from '@ojoro/contracts';

import {
  answerIdeas,
  answerKey,
  answerWhy,
  conciergeErrorLine,
  invokeOutcome,
  nothingFitsPanel,
  rulesFallback,
  conciergeQuery,
  confirmLabel,
  ideaCount,
  ideaTitle,
  ideaWhy,
  moreIdeasLabel,
  type Idea,
} from './conciergeLogic';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-29T13:00:00Z'); // Thu 9 AM

const plan: Idea = {
  kind: 'plan',
  plan_id: 'p1',
  sport_id: 'football',
  sport_name: 'Football',
  title: 'Pickup football',
  starts_at: '2026-10-29T23:30:00Z', // 7:30 PM today
  place_name: 'Jeanne-Mance Park',
  member_count: 6,
  capacity: 8,
  demand_count: 0,
  window_start: '',
  window_end: '',
  reason: "it fits your 90 minutes, it's 1.2 km away and 3 people you've played with are in",
};

const demand: Idea = {
  ...plan,
  kind: 'demand',
  plan_id: '',
  sport_id: 'running',
  sport_name: 'Running',
  title: '',
  starts_at: '2026-10-30T22:00:00Z', // Fri 6 PM
  place_name: '',
  member_count: 0,
  capacity: 0,
  demand_count: 3,
  window_end: '2026-10-31T01:00:00Z',
  reason: '3 people near you are down for running then and it becomes a plan when you say yes',
};

describe('Concierge', () => {
  it('asks only with something to read', () => {
    expect(conciergeQuery('  ')).toBeNull();
    expect(conciergeQuery('ab')).toBeNull();
    expect(conciergeQuery('  a   run ')).toBe('a run');
    expect(conciergeQuery('x'.repeat(300))).toHaveLength(200);
  });

  it('titles a plan and a demand', () => {
    expect(ideaTitle(plan, NOW, TZ)).toBe('Pickup football · 7:30 · Jeanne-Mance Park');
    expect(ideaTitle({ ...plan, starts_at: '2026-10-30T23:30:00Z', title: null }, NOW, TZ)).toBe(
      'Football · Tomorrow 7:30 · Jeanne-Mance Park',
    );
    expect(ideaTitle(demand, NOW, TZ)).toBe('Running · Tomorrow from 6 PM · 3 people down');
    expect(ideaTitle({ ...demand, starts_at: '2026-10-29T22:00:00Z', demand_count: 1 }, NOW, TZ)).toBe(
      'Running · from 6 PM · 1 person down',
    );
  });

  it('says why in plain words', () => {
    expect(ideaWhy(plan)).toBe("Why: it fits your 90 minutes, it's 1.2 km away and 3 people you've played with are in.");
    expect(ideaWhy({ reason: 'it is close.' })).toBe('Why: it is close.');
    expect(ideaWhy({ reason: ' ' })).toBeNull();
  });

  it('counts, in words and segments', () => {
    expect(ideaCount(plan)).toEqual({ value: 6, max: 8, label: '6 / 8 IN · 2 SPOTS LEFT', spoken: '6 of 8 in' });
    expect(ideaCount({ ...plan, member_count: 7 })?.label).toBe('7 / 8 IN · 1 SPOT LEFT');
    expect(ideaCount({ ...plan, capacity: 0 })).toBeNull();
    expect(ideaCount(demand)).toMatchObject({ value: 3, max: 4, label: '3 DOWN · A PLAN AT 4' });
    expect(ideaCount({ ...demand, demand_count: 0 })).toBeNull();
  });

  it('labels the confirm and the more ideas toggle', () => {
    expect(confirmLabel(plan)).toBe("I'M DOWN");
    expect(confirmLabel(demand)).toBe('MAKE IT HAPPEN');
    expect(moreIdeasLabel(2, false)).toBe('2 MORE IDEAS');
    expect(moreIdeasLabel(1, false)).toBe('1 MORE IDEA');
    expect(moreIdeasLabel(1, true)).toBe('HIDE IDEAS');
    expect(moreIdeasLabel(0, false)).toBeNull();
  });

  it('words its own errors', () => {
    expect(conciergeErrorLine('invalid_argument', 'minutes')).toContain('15 minutes to 8 hours');
    expect(conciergeErrorLine('sport_unknown', null)).toContain("doesn't know that sport");
    expect(conciergeErrorLine('network', null)).toBeNull();
  });
});

describe('Concierge answers', () => {
  const best = { ...plan, matched: true } as unknown as ConciergeIdea;
  const other = { ...plan, plan_id: 'p2', reason: "it's 2 km away", matched: true } as unknown as ConciergeIdea;
  const answer: ConciergeAnswer = {
    source: 'ai',
    fallback_reason: null,
    outcome: 'match',
    best,
    why: 'it fits your 90 minutes and 3 people you know are in',
    more: [other],
    start: null,
    sport_id: 'football',
  };

  it("uses the answer's WHY for the best match and each idea's reason for the rest", () => {
    expect(answerWhy(answer, best as unknown as Idea)).toBe('Why: it fits your 90 minutes and 3 people you know are in.');
    expect(answerWhy(answer, other as unknown as Idea)).toBe("Why: it's 2 km away.");
    expect(answerWhy({ ...answer, why: null }, best as unknown as Idea)).toBe(ideaWhy(plan));
  });

  it('lists the best match first and keys the answer', () => {
    expect(answerIdeas(answer).map((i) => i.plan_id)).toEqual(['p1', 'p2']);
    expect(answerIdeas({ best: null, more: [other] }).map((i) => i.plan_id)).toEqual(['p2']);
    expect(answerKey(answer)).toBe('match||p1|p2');
    expect(answerKey(undefined)).toBe('');
  });

  it('says how to start something when nothing fits, in fixed words', () => {
    expect(nothingFitsPanel({ outcome: 'nothing_fits', start: 'down_for' })).toMatchObject({ action: "SAY YOU'RE DOWN", start: 'down_for' });
    expect(nothingFitsPanel({ outcome: 'nothing_fits', start: null }).start).toBe('down_for');
    expect(nothingFitsPanel({ outcome: 'nothing_fits', start: 'quick_plan' }).action).toBe('QUICK PLAN');
    expect(nothingFitsPanel({ outcome: 'nothing_fits', start: 'activity' }).action).toBe('ACTIVITY');
    expect(nothingFitsPanel({ outcome: 'nothing_fits', start: 'call_out' }).action).toBe('CALL OUT');
    const off = nothingFitsPanel({ outcome: 'not_movement', start: 'call_out' });
    expect(off).toMatchObject({ overline: 'TELL OJORO WHAT YOU WANT TO DO', start: 'down_for' });
    for (const s of ['down_for', 'quick_plan', 'activity', 'call_out'] as const) {
      const p = nothingFitsPanel({ outcome: 'nothing_fits', start: s });
      expect(p.body).not.toMatch(/!|\$|money|odds/);
    }
  });

  it('decides between the answer, the rules fallback and an error', () => {
    expect(invokeOutcome(200, answer)).toEqual({ kind: 'answer', answer });
    expect(invokeOutcome(200, { nope: true })).toEqual({ kind: 'fallback' });
    expect(invokeOutcome(null, null)).toEqual({ kind: 'fallback' });
    expect(invokeOutcome(404, { message: 'not found' })).toEqual({ kind: 'fallback' });
    expect(invokeOutcome(503, { code: 'BOOT_ERROR' })).toEqual({ kind: 'fallback' });
    const bad = { code: 'P0001', message: 'invalid_argument', details: 'text' };
    expect(invokeOutcome(400, bad)).toEqual({ kind: 'error', body: bad });
    expect(invokeOutcome(502, bad)).toEqual({ kind: 'fallback' });
  });

  it('shapes the rules rows when the function is unreachable', () => {
    const a = rulesFallback([plan as never]);
    expect(a).toMatchObject({ source: 'rules', fallback_reason: 'unreachable', outcome: 'match' });
  });
});
