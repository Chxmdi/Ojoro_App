import { describe, expect, it } from 'vitest';

import {
  conciergeErrorLine,
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
